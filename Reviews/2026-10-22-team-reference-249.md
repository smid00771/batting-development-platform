# Team-selection reference layout — .249 beta

The team graphic displayed opposition, format, date/time and ground as separate lines beneath the grade. This did not follow the supplied previous example.

The shared renderer now places Round # V Opposition above a larger grade heading, then start time // ground, then the full weekday, ordinal day and month. Format, overs and competition are omitted from the image. Names have a wider column and larger lettering; the featured-player marker follows the name. Integrated artwork uses a small text shadow where contrast needs support instead of a broad names panel.

The artwork sample includes a clearly synthetic round. Published graphics use their own fixture's round. Both dates and differing start times remain visible for shared two-day teams, while separate-day graphics use that day's details. Missing rounds are not guessed. Source data, captions, photo positioning, exports, saved history and awards-week labels retain their existing behavior.

Validation covers the actual canvas text order and geometry, long ground names, two-day dates and starts, missing fields, marker placement, unchanged source data, existing photo positioning/retry behavior and the team workflow. A synthetic rendered poster was visually inspected. The existing workflow mock now includes the round lookup introduced in .248. No database or service changes are required.

Version: 0.8.62.249. The uploaded examples and private club records are not included in this source change. Physical-phone acceptance remains part of the beta.
