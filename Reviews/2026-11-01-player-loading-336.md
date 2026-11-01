# 0.8.62.336 — player coaching loads

Database migration applied and checked before frontend publication.

Opening a coaching update requests its one observation. The player conversation list omits staff editing context and duplicate downloads. The focused screen shows the attributed comment, saved player/coach answers and View innings. Blank answers remain unflagged.

Navigation and async controls show immediate loading feedback. Repeated taps share pending actions; filter changes still accept the latest choice. Coaching reads have a bounded wait and retry message. Existing save and retry behaviour is retained.

Validation: 72 targeted UI/navigation checks, 21 unchanged access cases, authenticated synthetic observation/reflection/video checks before and after migration, JavaScript syntax, a fresh demo build, whitespace checks and a phone-width browser check. Synthetic database records were rolled back.
