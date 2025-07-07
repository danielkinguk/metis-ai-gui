# SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: Apache-2.0

from abc import ABC, abstractmethod


class BaseLanguagePlugin(ABC):
    @abstractmethod
    def get_name(self) -> str:
        """Return the name of the plugin."""
        pass

    @abstractmethod
    def can_handle(self, extension: str) -> bool:
        """Return True if this plugin can handle the file extension."""
        pass

    @abstractmethod
    def get_splitter(self):
        """Return a splitter instance for code."""
        pass

    @abstractmethod
    def get_prompts(self) -> dict:
        """Return a dictionary of language-specific prompts."""
        pass

    @abstractmethod
    def get_supported_extensions(self) -> list:
        """Return a list of file extensions supported by this language."""
        pass
