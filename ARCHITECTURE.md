# Architecture Guide

Cuewise ships the same React application in a browser extension and a macOS desktop app. Start in `packages/app` for a feature that appears in both clients. Each host supplies the storage, scheduling, and notification adapters its runtime supports.

## Workspace map

| Application | Responsibility |
| --- | --- |
| [apps/browser-extension](apps/browser-extension) | Hosts the new-tab page, popup, and background service worker and integrates with Chrome APIs. |
| [apps/macos](apps/macos) | Hosts the desktop app in Tauri and integrates native features such as the tray and reminder scheduler. |
| [apps/api](apps/api) | Serves the Cloudflare Worker API for authentication, sync, pairing, and integrations, with persistence in D1. |
| [apps/website](apps/website) | Builds the public Cuewise website with Astro. |

| Package | Responsibility |
| --- | --- |
| [packages/app](packages/app) | Owns application screens, feature components, hooks, and stores shared by the extension and desktop app. |
| [packages/ui](packages/ui) | Provides reusable React UI components for composing screens. |
| [packages/shared](packages/shared) | Defines domain types, business logic, constants, and platform interfaces used across workspaces. |
| [packages/storage](packages/storage) | Provides local key-value storage adapters and typed helpers for reading and writing application data. |
| [packages/crypto](packages/crypto) | Implements cryptographic primitives, key envelopes, recovery codes, and device-pairing cryptography. |
| [packages/sync-client](packages/sync-client) | Implements the sync API client, wire types, and client session management. |
| [packages/sync-engine](packages/sync-engine) | Tracks local mutations, coordinates push and pull cycles, and manages sync keys and pairing. |
| [packages/test-utils](packages/test-utils) | Supplies shared test fixtures, factories, and mocks. |

## How the clients fit together

Both hosts configure platform adapters at startup. Shared features use the platform interfaces in `@cuewise/shared` and the typed persistence helpers in `@cuewise/storage`. For example, a change to reminder presentation belongs in the shared app, while a change to how a timer wakes the app belongs in the host scheduler.

The extension service worker owns the sync engine. The new-tab page sends mutations and sync commands to it through Chrome runtime messaging. The macOS main window runs the engine directly. Both paths use the same sync engine and API client. See the [extension service worker](apps/browser-extension/src/background.ts), [extension page](apps/browser-extension/src/main.tsx), and [macOS entry point](apps/macos/src/main.tsx).
