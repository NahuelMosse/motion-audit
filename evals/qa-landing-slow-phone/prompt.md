---
name: qa-landing-slow-phone
description: A normal and a CPU-throttled audit.
tags: [should-trigger]
max_turns: 5
allowed_tools: [Skill, Read, Glob, Grep]
---

QA the motion of the landing page at http://localhost:3000 before release, on a slow phone too.
