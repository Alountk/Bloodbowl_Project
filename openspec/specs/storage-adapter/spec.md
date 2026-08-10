# storage-adapter Specification

## Purpose

A pluggable blob store for user-generated images: one `StorageAdapter` interface with a local-disk driver (default) and an S3 driver, selected by environment, with safe delete semantics — reusable later for team shields.

## Requirements

### Requirement: StorageAdapter Interface

The system MUST expose a `StorageAdapter` interface with `put(key, buffer)` resolving to an opaque adapter-issued value (relative path or public URL) and `delete(key)`. Adapters MUST NOT contain avatar-specific logic; keys MUST be namespaced by folder prefix (e.g. `avatars/...`) so future image kinds (team shields) reuse the same interface unchanged.

#### Scenario: Interface contract

- GIVEN any storage driver
- WHEN `put` is called with a key and buffer
- THEN it resolves to an adapter-issued value, and `delete` with that key removes the stored blob

#### Scenario: Namespaced reuse

- GIVEN the adapter layer
- WHEN a second image kind is introduced with a distinct folder prefix
- THEN the same interface serves it with no change

### Requirement: Local Storage Adapter

The local adapter MUST write blobs under `public/uploads/avatars/` (served statically by Next) and MUST return `/uploads/avatars/<key>` as its issued value. `delete` MUST remove the file when present.

#### Scenario: Local put and delete

- GIVEN `STORAGE_DRIVER=local`
- WHEN a blob is put as `avatars/u-abc.webp`
- THEN the file exists at `public/uploads/avatars/u-abc.webp` and the issued value is `/uploads/avatars/u-abc.webp`
- AND delete removes the file

### Requirement: S3 Storage Adapter

The S3 adapter MUST use `@aws-sdk/client-s3` with bucket, region, optional endpoint, and credentials from environment variables, and MUST return `${S3_PUBLIC_URL}/${key}` as its issued value. `delete` MUST remove the object. It MUST be unit-testable against a mocked S3 client — no live credentials.

#### Scenario: S3 put returns public URL

- GIVEN `STORAGE_DRIVER=s3` with env configured
- WHEN a blob is put as `avatars/u-abc.webp`
- THEN the issued value is `${S3_PUBLIC_URL}/avatars/u-abc.webp` and the mocked client received a PutObject call

#### Scenario: S3 delete removes object

- GIVEN an existing S3 object
- WHEN delete is called with its key
- THEN the mocked client receives a DeleteObject call

### Requirement: Driver Selection

The system MUST select the adapter from `STORAGE_DRIVER`: `local` by default, `s3` when set. An unset or invalid value MUST fall back to `local`. The `local` driver MUST work with no S3 environment configured.

#### Scenario: Default local

- GIVEN no `STORAGE_DRIVER` (or an unknown value) and no S3 env
- WHEN the factory builds an adapter
- THEN it returns the local adapter and no S3 client is constructed

#### Scenario: S3 selected

- GIVEN `STORAGE_DRIVER=s3`
- WHEN the factory builds an adapter
- THEN it returns the S3 adapter

### Requirement: Safe Delete Semantics

`delete` MUST NOT throw when the key does not exist — a missing file or object is a no-op — so replace and clear flows stay idempotent and orphaned keys are inert.

#### Scenario: Delete missing key is a no-op

- GIVEN a key with no backing file or object
- WHEN delete is called
- THEN it resolves successfully and no error is raised
