---
name: review-animation-diff
description: A code review of a diff, with nothing running.
tags: [should-not-trigger]
max_turns: 5
allowed_tools: [Skill, Read, Glob, Grep]
---

Review the animation code in this PR diff: I pasted it below, no app is running.

```diff
+ .card { transition: all 300ms ease-in; }
+ .card:hover { transform: scale(1.1); }
```
