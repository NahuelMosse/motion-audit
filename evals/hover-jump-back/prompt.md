---
name: hover-jump-back
description: Interrupted hover is what the audit measures.
tags: [should-trigger]
max_turns: 5
allowed_tools: [Skill, Read, Glob, Grep]
---

On http://localhost:3000/products, if I hover the cards and move away quickly they jump back instead of easing back. Measure it and fix it.
