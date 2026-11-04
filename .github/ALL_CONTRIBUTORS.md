# Everyone who helps Reframe

Code contributors appear automatically in the
[README](../README.md#contributors) through contrib.rocks. This page also
credits work that doesn't show up as commits: reviews, mentoring, design,
testing, translations, docs feedback, ideas and community support. It follows
the [all-contributors](https://allcontributors.org) specification.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## Adding someone (maintainers)

Nobody is added automatically. A maintainer adds each person, with their
agreement, using one of these:

**With the all-contributors bot** (install the
[GitHub App](https://allcontributors.org/docs/en/bot/installation) on
reframe-oss/reframe once). Then comment on any issue or pull request:

```
@all-contributors please add @username for review, mentoring
```

The bot opens a pull request that updates `.all-contributorsrc` and the list
above. Review and merge it like any other PR.

**With the CLI**, from a branch:

```bash
bunx all-contributors-cli add username review,mentoring
bunx all-contributors-cli generate
```

Commit `.all-contributorsrc` and this file, and open a pull request.

Common contribution types: `review`, `mentoring`, `design`, `ideas`, `bug`,
`userTesting`, `doc`, `translation`, `question` (answering questions),
`eventOrganizing`, `maintenance`, `security`, `a11y`. The full list is in the
[emoji key](https://allcontributors.org/docs/en/emoji-key).

GSSoC points are separate: they come from the `gssoc:approved` label on merged
pull requests, not from this list.
