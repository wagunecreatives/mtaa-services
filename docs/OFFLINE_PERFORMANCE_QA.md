# MTAA SERVICES — Offline, Network and Device QA

This checklist is for the Expo Android app. Do not mark a device/network scenario passed until it has been run on a real device or emulator and the result recorded.

## Required device profiles

| Profile | Suggested setup | Acceptance criteria |
|---|---|---|
| Low-end Android | 2–3 GB RAM, Android Go/older budget device | No crash or frozen screen; forms remain responsive; loading and retry states are visible |
| Mid-range Android | 4–6 GB RAM | All flows work; no repeated requests after tapping twice |
| High-end Android | Current Android device | Same behaviour and correctness as low-end device |
| Slow connection | Android network throttling around 400 kbps, 800 ms latency, 5% packet loss | Screen gives feedback; retries work; draft remains intact |
| Intermittent connection | Toggle airplane mode during category fetch and request submission | No lost draft; no duplicate service request after retry |
| Fast connection | Normal Wi-Fi/4G/5G | No unnecessary long loading state; screens complete normally |

## Request-flow scenarios

- [ ] Start a request, fill every field, force-close the app, reopen, and confirm the draft is restored.
- [ ] Disable internet before opening the confirmation screen. Tap Send and confirm the request is added to the on-device queue with a clear status.
- [ ] Restore internet while the confirmation screen is open. Confirm the queued request sends automatically and exactly one row exists in `service_requests`.
- [ ] Queue a request, force-close and reopen the app, then revisit the confirmation screen. Confirm the queued request retries when connectivity returns.
- [ ] Sign into a different account while a request is queued. Confirm the queued request is not submitted under the other account.
- [ ] Tap Send repeatedly while the first submission is in progress. Only one request is created.
- [ ] Simulate a server commit whose response is lost, then retry with the same client request ID. The RPC returns the original request UUID.
- [ ] Confirm validation and server rate limits still apply to a genuinely new request ID.
- [ ] Open Find a service offline after loading it online once. Cached featured providers are shown with a stale-data notice and a retry action.
- [ ] Open Find a service with no cache and no internet. Show an offline error, not “No featured providers”.
- [ ] Reconnect and retry. Live results replace the cached results.

## Provider onboarding scenarios

- [ ] Complete part of provider setup, force-close the app, reopen, and confirm the saved business details, selected services, areas, and availability are restored.
- [ ] Confirm the onboarding start screen offers a resume action and returns to the next incomplete step.
- [ ] Lose connectivity while loading service categories or suggested areas. Confirm a retry action is available and entered details remain intact.
- [ ] Lose connectivity during provider submission, restore it, and retry. Confirm the existing provider application is updated rather than duplicated.
- [ ] Confirm persistence errors are visible and do not claim that setup progress was saved.

## Permission scenarios

- [ ] **GPS unavailable:** deny location permission; manually enter estate/area and county and continue.
- [ ] **Location denied:** verify the app explains that manual location is allowed and does not repeatedly prompt.
- [ ] **Notification denied:** browse, create, and track a request without crashing; explain that push alerts are unavailable and keep in-app request tracking usable.
- [ ] **Camera denied:** provider profile / verification upload shows a useful explanation and a gallery/manual alternative where supported; the rest of the app remains usable.
- [ ] Revoke permissions in Android Settings while the app is backgrounded, then return and retry the relevant flow.

## Performance and reliability checks

- [ ] Test cold start and return from background on all three device profiles.
- [ ] Scroll long request lists and provider details; look for jank, unresponsive taps, or repeated refetches.
- [ ] Test empty, loading, error, cached, and successful states for every network-backed screen.
- [ ] Verify buttons are disabled while an operation is in progress and re-enabled after failure.
- [ ] Check that network errors never clear a request draft.
- [ ] Verify no screen labels a failed request as successful unless the RPC returns a request ID.
- [ ] Verify all cached data is treated as potentially stale and refreshed when online.

## Useful local commands

```bash
npm ci
npx expo-doctor
npx expo lint
npx tsc --noEmit
npx expo start --clear
```

Run the app on an Android emulator and on physical devices. For slow-network tests, use emulator network-speed controls or Android Studio's network throttling. Record device model, Android version, build/commit, scenario, expected result, actual result, and pass/fail for every test.

## Current scope / limitation

Request drafts and queued submissions are persisted locally. A queued request retries when connectivity returns while the confirmation screen is open, or when that screen is reopened; it is scoped to the account that queued it and uses a stable idempotency key. Provider onboarding progress is saved per signed-in provider on the device; selected image URIs may need to be reselected after an app restart. Device-specific performance and permission scenarios must be executed in Android Studio / on real phones and are not considered passed merely because the code has been committed.
