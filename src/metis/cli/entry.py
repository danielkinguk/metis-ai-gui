# SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: Apache-2.0


import argparse
import logging
from pathlib import Path
from datetime import datetime

from rich.console import Console
from prompt_toolkit import prompt
from prompt_toolkit.completion import WordCompleter
from prompt_toolkit.history import InMemoryHistory

from metis.configuration import load_runtime_config
from metis.engine import MetisEngine
from metis.providers.openai import OpenAIProvider

try:
    from metis.vector_store.pgvector_store import PGVectorStoreImpl
except ImportError:
    pass


from .commands import (
    run_index,
    run_ask,
    run_review,
    run_file_review,
    run_review_code,
    run_update,
    show_help,
)
from .utils import (
    configure_logger,
    PG_SUPPORTED,
    build_pg_backend,
    build_chroma_backend,
    print_console,
)

console = Console()
logger = logging.getLogger("metis")
COMMANDS = {
    "index": {"func": run_index, "args_required": 0, "usage": "index"},
    "review_patch": {
        "func": run_review,
        "args_required": 1,
        "usage": "review_patch <patch_file>",
    },
    "review_code": {
        "func": run_review_code,
        "args_required": 0,
        "usage": "review_code",
    },
    "update": {"func": run_update, "args_required": 1, "usage": "update <patch_file>"},
    "review_file": {
        "func": run_file_review,
        "args_required": 1,
        "usage": "review_file <file_path>",
    },
    "ask": {"func": run_ask, "args_required": 1, "usage": "ask <question>"},
    "help": {"func": show_help, "args_required": 0, "usage": "help"},
    "exit": {"func": None, "args_required": 0, "usage": "exit"},
}

completer = WordCompleter(COMMANDS, ignore_case=True)


def execute_command(
    engine, cmd, cmd_args, output_file=None, verbose=False, quiet=False
):
    if cmd not in COMMANDS:
        print_console(f"[red]Unknown command:[/red] {cmd}", quiet)
        return

    command_info = COMMANDS[cmd]
    if len(cmd_args) < command_info["args_required"]:
        print_console(f"[red]Usage:[/red] {command_info['usage']}", quiet)
        return

    if cmd == "exit":
        print_console("[magenta]Goodbye![/magenta]", quiet)
        exit(0)
    elif cmd == "help":
        command_info["func"]()
        return

    if cmd in {"review_patch", "review_code", "review_file"}:
        command_info["func"](engine, *(cmd_args), output_file, quiet)
    elif cmd == "ask":
        command_info["func"](engine, " ".join(cmd_args))
    elif cmd == "index":
        command_info["func"](engine, verbose, quiet)
    elif cmd == "update":
        command_info["func"](engine, cmd_args[0], quiet)


def main():
    parser = argparse.ArgumentParser(
        description="Metis: AI security focused code review.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("--project-schema", type=str, default="myproject-main")
    parser.add_argument("--chroma-dir", type=str, default="./chromadb")
    parser.add_argument("--codebase-path", type=str, default=".")
    parser.add_argument("--language-plugin", type=str, default="c")
    parser.add_argument(
        "--backend",
        type=str,
        default="chroma",
        choices=["chroma", "postgres"],
    )
    parser.add_argument("--log-file", type=str)
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
    )
    parser.add_argument("--output-file", type=str)
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose output (default: off)",
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Run Metis in non-interactive mode",
    )
    parser.add_argument(
        "--command",
        type=str,
        help="Command to run in non-interactive mode (e.g., 'review_patch file.patch').",
    )
    parser.add_argument(
        "-q", "--quiet", action="store_true", help="Suppress output in CLI"
    )
    args = parser.parse_args()

    if args.quiet and args.verbose:
        print_console(
            "[red]Error:[/red] --quiet and --verbose cannot be used together.", False
        )
        exit(1)

    configure_logger(logger, args)
    runtime = load_runtime_config(enable_psql=(args.backend == "postgres"))
    llm_provider = OpenAIProvider(runtime)

    embed_model_code = llm_provider.get_embed_model_code()
    embed_model_docs = llm_provider.get_embed_model_docs()

    if args.backend == "postgres":
        vector_backend = build_pg_backend(
            args, runtime, embed_model_code, embed_model_docs
        )
    else:
        vector_backend = build_chroma_backend(
            args, runtime, embed_model_code, embed_model_docs
        )

    engine = MetisEngine(
        codebase_path=args.codebase_path,
        language_plugin=args.language_plugin,
        llm_provider=llm_provider,
        vector_backend=vector_backend,
        **runtime,
    )

    if args.non_interactive:
        if not args.command:
            print_console(
                "[red]Error:[/red] --command is required in non-interactive mode.",
                args.quiet,
            )
            exit(1)

        cmd_parts = args.command.strip().split()
        cmd, cmd_args = cmd_parts[0], cmd_parts[1:]

        output_file = args.output_file
        if not output_file:
            Path("results").mkdir(exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"results/{cmd}_{timestamp}.json"

        try:
            execute_command(
                engine, cmd, cmd_args, output_file, args.verbose, args.quiet
            )
        except Exception as e:
            print_console(f"[bold red]Error:[/bold red] {e}", args.quiet)
            exit(1)

        exit(0)

    print_console(
        "[bold cyan]Metis CLI. Type 'help' for usage, 'exit' to quit.[/bold cyan]",
        args.quiet,
    )
    history = InMemoryHistory()

    while True:
        try:
            user_input = prompt("> ", completer=completer, history=history).strip()
            if not user_input:
                continue

            cmd_parts = user_input.split()
            cmd, cmd_args = cmd_parts[0], cmd_parts[1:]

            if PG_SUPPORTED and isinstance(vector_backend, PGVectorStoreImpl):
                if cmd == "index" and vector_backend.check_project_schema_exists():
                    print_console(
                        "[red]Schema already exists. Cannot reindex.[/red]", args.quiet
                    )
                    continue
                elif (
                    cmd in {"ask", "review_code", "review_file"}
                    and not vector_backend.check_project_schema_exists()
                ):
                    print_console(
                        "[red]Schema is missing. Did you forget to index?[/red]",
                        args.quiet,
                    )
                    continue

            output_file = None
            if "--output-file" in cmd_args:
                idx = cmd_args.index("--output-file")
                if len(cmd_args) > idx + 1:
                    output_file = cmd_args[idx + 1]
                    del cmd_args[idx : idx + 2]
            else:
                Path("results").mkdir(exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                output_file = f"results/{cmd}_{timestamp}.json"

            execute_command(engine, cmd, cmd_args, output_file, args.verbose)

        except (EOFError, KeyboardInterrupt):
            print_console("\n[magenta]Bye![/magenta]", args.quiet)
            break
        except Exception as e:
            print_console(f"[bold red]Error:[/bold red] {e}", args.quiet)
