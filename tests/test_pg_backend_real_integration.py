# SPDX-FileCopyrightText: Copyright 2025 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: Apache-2.0

import pytest
from unittest.mock import Mock
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError


@pytest.mark.postgres
def test_pg_backend_real_init():
    try:
        engine = create_engine(
            "postgresql://metis_user:metis_password@localhost:5432/metis_db"
        )
        engine.connect()
    except OperationalError:
        pytest.skip("Postgres is not available.")

    from metis.vector_store.pgvector_store import PGVectorStoreImpl

    backend = PGVectorStoreImpl(
        connection_string="postgresql://metis_user:metis_password@localhost:5432/metis_db",
        project_schema="test_schema",
        embed_model_code=Mock(),
        embed_model_docs=Mock(),
        embed_dim=1536,
    )

    backend.init()
    ctx_code, ctx_docs = backend.get_storage_contexts()
    assert ctx_code is not None
    assert ctx_docs is not None
