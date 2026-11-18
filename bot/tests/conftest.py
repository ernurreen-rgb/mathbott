"""Shared test setup: the tests never report to Sentry.

Importing the app runs instrument.py, which loads bot/.env.local; a developer's real
SENTRY_DSN there would otherwise send the tests' errors to the live project. An empty value
set first is kept, because .env files never override variables that already exist.
"""
import os

os.environ["SENTRY_DSN"] = ""
