# SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: Apache-2.0

import pytest
from unittest.mock import Mock


@pytest.mark.postgres
def test_pg_vectorstore_mocked_init(monkeypatch):

    from metis.vector_store.pgvector_store import PGVectorStoreImpl

    pg = PGVectorStoreImpl(
        connection_string="postgresql://...",
        project_schema="test_schema",
        embed_model_code=Mock(),
        embed_model_docs=Mock(),
        embed_dim=1536,
        logger=None,
    )

    monkeypatch.setattr(pg, "check_project_schema_exists", lambda: True)
    pg.vector_store_code = Mock(add=Mock(return_value=["mock_id"]))
    pg.vector_store_docs = Mock(add=Mock(return_value=["mock_id"]))
    pg.get_storage_contexts = lambda: ("code_ctx", "doc_ctx")

    pg.init()
    ctx = pg.get_storage_contexts()
    assert ctx == ("code_ctx", "doc_ctx")
