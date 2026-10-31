# Concept and Design Principles

[← Documentation](./README.md) | Language: [日本語](../ja/concept.md) | **English**

Every Bracify feature is designed to follow the principles on this page. Feature proposals (Issues) and their implementation must pass the "Checklist for proposing a feature" at the end.

## Target users

| User | Can do | Assumed unable to do |
|---|---|---|
| **End users without IT expertise** (the yardstick) | Write and edit HTML, pick a template, press buttons following on-screen instructions, fill in a web service's account form | Run commands in a terminal, set environment variables, hand-write configuration files, prepare a server / database / mail server, write JavaScript |
| **Light web engineers** (markup engineers, etc.) | All of the above, plus write HTML / CSS freely and follow a written procedure | Same as above. Even if they can, we do not make them |

Features are designed so that end users can use them. "Engineers can use it" is not enough for a main feature.

## Design principles

1. **HTML only**: features are declared with HTML tags and attributes. No feature requires writing JavaScript.
2. **No terminal**: creating, previewing, managing data, configuring, publishing and updating are all done in the Bracify Studio screens.
3. **Settings the user decides are made in Studio**: users are never asked to set environment variables, hand-write configuration files or edit the database directly. Settings are registered in the [settings list](./settings.md) and are saved and published together with the project. Environment variables exist only as a way for engineers to override.
4. **No external services to prepare**: no feature may require the user to prepare a mail server, an API key or an account at a specific cloud. Where one is unavoidable, Studio guides the user through it on screen, and the basic behavior works without it.
5. **Secure by default**: forgetting a declaration or a setting falls on the safe side (not public, not writable, capped).
6. **No lock-in to an environment**: no specific hosting provider, container technology or OS is assumed.
7. **Same result in SSR and CSR**: the same HTML gives the same result on the server (SSR) and in the browser (CSR / local mode).
8. **Plain HTML stays yours**: a project is just HTML and data. It survives leaving Bracify and can be taken anywhere.

## Features for engineers

Features only engineers can use, such as JavaScript extensions (hooks), the CLI or external database connections, may be built under these conditions:

- **Optional**: every main feature (building, saving data, publishing, updating) works without them.
- **Labeled**: the documentation marks them as "advanced", and they do not appear in Studio's regular screens.
- **Not a substitute**: a design that says "this is hard for end users, so an engineer-only feature solves it" is not accepted.

## Checklist for proposing a feature

Check all of the following when opening an Issue and before implementing it. If any answer is "no", redesign the feature, or state in the Issue how it meets the conditions in "Features for engineers".

1. Can end users use the feature **with HTML and the Studio screens only** (no terminal, environment variables, hand-written configuration files or JavaScript)?
2. When the user's steps are written out, does every step fit in the "Can do" column above?
3. If there is a new setting, has a row been added to the [settings list](./settings.md), and can it be set in Studio?
4. Does it work without the user preparing an external service (mail server, API key, a specific cloud)?
5. Does forgetting a declaration or setting fall on the safe side?
6. Is it free of assumptions about a specific hosting provider, container technology or OS?
7. Does it give the same result in SSR and CSR (local mode)? If not, are the reason and the limitation written down?
