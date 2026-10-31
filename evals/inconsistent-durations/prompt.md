---
name: inconsistent-durations
description: Declared durations per control kind are compared by the audit.
tags: [should-trigger]
max_turns: 5
allowed_tools: [Skill, Read, Glob, Grep]
---

Our buttons at http://localhost:3000 all animate at different speeds, make the motion consistent. Find which ones differ first.
