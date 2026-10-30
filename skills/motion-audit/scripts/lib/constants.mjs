// Named thresholds and timings shared by the analysis and the browser driver.
export const FRAME_MS = 1000 / 60;
export const LONG_FRAME_MS = 50;
export const MIN_PLAYWRIGHT = [1, 43];
export const SCHEMA_VERSION = 1;

export const DEFAULT_MAX_ELEMENTS = 40;
export const VIEWPORT = { width: 1280, height: 900 };
export const NAV_TIMEOUT_MS = 45000;
export const WAIT_FOR_TIMEOUT_MS = 15000;
export const HYDRATION_WAIT_MS = 800;
export const PROBE_RELOAD_WAIT_MS = 600;

// Dwell times of each gesture.
export const HOVER_DWELL_MS = 450;
export const PRESS_DWELL_MS = 250;
export const FOCUS_DWELL_MS = 300;
export const REST_MIN_MS = 400;
export const REST_MAX_MS = 1200;
export const REST_MARGIN_MS = 150;
export const INTERRUPT_MIN_MOTION_MS = 80;
export const INTERRUPT_LEAD_MS = 80;
export const INTERRUPT_TAIL_MS = 400;
export const CLICK_LEAD_MS = 250;
export const CLICK_RECORD_MS = 1500;
export const CLICK_INTERRUPT_MS = 160;
export const SCROLL_STEP_PX = 160;
export const SCROLL_STEP_MS = 90;
export const SCROLL_TAIL_MS = 600;

// Toggle probing.
export const MAX_TOGGLES = 8;
export const TOGGLE_MIN_MOTION_MS = 80;
export const TOGGLE_SETTLE_MARGIN_MS = 350;
export const TOGGLE_SHARES = [0.3, 0.55];

// Tracer.
export const TRACE_SUBTREE_CAP = 60;
export const TRACE_PAGE_CAP = 800;
export const TRACE_MOUNT_CAP = 400;
export const TRACE_MIN_SIZE_PX = 4;

// Findings policy.
export const BANDS = { hover: [80, 300], press: [50, 200], focus: [0, 250] };
export const INCONSISTENT_RATIO = 1.5;
export const INCONSISTENT_MIN_GAP_MS = 60;
export const OVERSHOOT_SPRING_PCT = 3;
export const EASE_IN_MIN_MS = 60;

// Jump detection. A position step is a jump only when the sampling is fine enough to bound the
// instantaneous velocity (or an Animation object says the animation restarted).
export const FINE_SAMPLING_MS = 1.5 * FRAME_MS;
export const JUMP_MAX_DT_MS = 2.5 * FRAME_MS;
export const JUMP_PEAK_SLOPE = 6;
export const JUMP_MIN_SHARE = 0.15;
export const RESTART_MIN_SHARE = 0.1;
export const RESTART_WINDOW = 3;
export const SMALL_MIN_SHARE = 0.2;
export const SMALL_STEP_EPS_FACTOR = 2;
export const RESTART_EVENT_SLACK_MS = 3 * FRAME_MS;
export const JUMP_MIN_STEP = { left: 24, top: 24, width: 24, height: 24, tx: 24, ty: 24, opacity: 0.4, sx: 0.3, sy: 0.3 };

// Confirmation of flaky findings: re-measured, kept when most runs agree.
export const CONFIRM_RUNS = 3;
export const CONFIRM_MAJORITY = 2;

// Reduced motion.
export const REDUCED_SCALE_DELTA = 0.06;
export const REDUCED_TRANSLATE_PX = 4;
export const REDUCED_LOOP_SPINNER_PX = 64;

export const HIT_TEST_POINTS = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]];
export const CLIP_MARGIN_PX = 6;
export const CONTACT_SHEET_STEP_MS = 40;

export const VISIBLE_PROPS = ['transform', 'translate', 'scale', 'rotate', 'opacity', 'background-color', 'background-image', 'color', 'box-shadow', 'border-color', 'outline-style', 'outline-width', 'outline-color', 'text-decoration-color', 'filter', 'width', 'height', 'padding-top', 'padding-left', 'margin-top', 'margin-left', 'top', 'left', 'letter-spacing', 'font-weight'];
export const LAYOUT_PROPS = /^(width|height|top|left|right|bottom|inset|margin|padding|max-height|max-width|min-height|min-width|font-size|font-weight|letter-spacing|border-width|line-height|gap)/;
export const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=menuitem], [role=checkbox], [role=link], [tabindex]:not([tabindex="-1"])';
export const TOGGLE = '[aria-expanded], [aria-controls], [aria-pressed], summary, [data-toggle]';
// Controls that --interact never presses or toggles: they submit, destroy, leave, drag or resize.
export const DENY_SELECTOR = '[type=submit], form button:not([type=button]), [draggable=true], [role=slider], [role=separator], [role=scrollbar], input[type=range], input[type=file]';
export const DENY_TEXT = /\b(delete|remove|destroy|discard|logout|log out|sign out|signout|unsubscribe|pay|buy|purchase|checkout|submit|send|confirm|archive|publish|deploy|reset)\b/i;
export const LOGIN_PATH = /\/(log-?in|sign-?in|sign_in|auth|sso|session\/new)(\/|$|\?)/i;
