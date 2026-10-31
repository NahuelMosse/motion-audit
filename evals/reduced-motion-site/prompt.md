---
name: reduced-motion-site
description: The audit measures reduced motion in a second context.
tags: [should-trigger]
max_turns: 5
allowed_tools: [Skill, Read, Glob, Grep]
---

Does our running site at http://localhost:3000 respect prefers-reduced-motion? Check it in a browser, not just the CSS.
