source visual truth path:
- /Users/youngminpark/Pictures/Photos Library.photoslibrary/resources/derivatives/5/5C4FDFCE-6A6C-4629-B6FC-85C4E9BD90C6_1_102_o.jpeg
- /Users/youngminpark/Pictures/Photos Library.photoslibrary/resources/derivatives/0/0F662E02-0B56-400E-BF24-ADEFBF6D6C4D_1_102_o.jpeg

implementation screenshot path: not captured

viewport: iPhone Safari portrait, authenticated app state

state:
- Chat room with message input focused and iOS Korean keyboard open
- Campus map with fixed-point bottom sheet open

full-view comparison evidence:
- Source chat screenshot shows the composer at the top of the visible page while the header and chat content are displaced offscreen.
- Source map screenshot shows the bottom sheet and primary button clipped by the Safari bottom toolbar.
- A same-state rendered implementation screenshot was not captured because this environment does not have the user's authenticated iOS Safari session or the actual iOS keyboard/browser chrome state.

focused region comparison evidence:
- Chat composer/input region: source shows broken document scroll and missing fixed header.
- Map bottom sheet/button region: source shows clipped bottom action area.
- Focused implementation comparison is blocked for the same-state capture reason above.

findings:
- [P1] Chat composer focus scrolls the app shell instead of preserving a fixed messenger layout.
  Location: app/rooms/[id]/page.tsx, app/globals.css.
  Evidence: source screenshot shows the input at the top of the viewport and no visible chat header.
  Impact: users lose room context while typing and the chat behaves unlike a normal messenger.
  Fix: use fixed chat header and fixed composer, reserve header/composer/keyboard space inside the message scroller, remove body position locking.

- [P1] Map bottom sheet is clipped by mobile Safari bottom chrome.
  Location: app/page.tsx, components/CampusRouteMap.tsx, app/globals.css.
  Evidence: source screenshot shows the "방 생성하기" button partially hidden behind the browser toolbar.
  Impact: primary action is visually broken and can be hard to tap.
  Fix: drive the logged-in map shell from visualViewport height, constrain the bottom sheet with max-height, and make sheet content internally scroll.

required fidelity surfaces:
- Fonts and typography: Paperlogy remains the app font. Chat message bubbles remain compact with reduced padding and line height. Implementation screenshot comparison is blocked.
- Spacing and layout rhythm: code now separates fixed chrome from scroll content and applies bottom sheet max-height/safe bottom spacing. Visual comparison is blocked.
- Colors and visual tokens: existing brand blue, white panels, and gray neutrals are retained. Visual token comparison is blocked.
- Image quality and asset fidelity: no new image assets were introduced. Existing map and logo assets are unchanged.
- Copy and content: no app copy changes beyond layout behavior.

patches made since previous QA pass:
- Rebuilt chat room shell around fixed header, scrollable messages, and fixed composer.
- Added CSS variables for chat header height, composer height, and keyboard inset.
- Removed body fixed positioning from chat route.
- Added visual viewport sizing for the logged-in map shell.
- Reworked map bottom sheet to use a viewport-aware max-height and internal scrolling.
- Added regression tests for chat keyboard layout and bottom sheet clipping.
- Added a low-emphasis settings entry for account deletion with a deliberate two-step confirmation flow.
- Added a server-side account deletion API using the Supabase service role key.
- Removed owner real-name exposure from public legal copy and metadata.
- Reworked legal pages into a compact system-font document layout with logo and back navigation.
- Tightened the landing headline shadow to reduce the broad blurred halo.

final result: blocked

blocker:
- Same-state rendered implementation capture requires the user's authenticated iOS Safari session with the iOS keyboard open. This environment cannot capture that exact state without controlling the user's device/browser session.
