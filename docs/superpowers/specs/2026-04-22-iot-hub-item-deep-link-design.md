# IoT Hub item deep link — design

**Status:** approved
**Date:** 2026-04-22
**Author:** Andrii Shvaika
**Scope:** ThingsBoard CE frontend + IoT Hub backend contract (external)

## Summary

Allow a URL of the form `http://<tb-host>/iot-hub/{itemId}` to open the detail view for any IoT Hub item, and a variant `/iot-hub/{itemId}/preview` to open the latest version of that item even when it is not yet published. The preview variant is intended for creators testing unpublished content on any ThingsBoard instance; it requires acknowledging a security warning before the detail view opens.

## Goals

- Shareable, bookmarkable deep links to IoT Hub items.
- Two URL shapes with distinct semantics:
  - `/iot-hub/{itemId}` — always latest published version.
  - `/iot-hub/{itemId}/preview` — latest version regardless of state (draft-first, falling back to published), gated by a security warning when unpublished.
- Zero backend changes in ThingsBoard. Install/update flows reuse the existing versionId-based pipeline.

## Non-goals

- Authenticated access to unpublished content. Authorization is "public-by-link": whoever has the item UUID can fetch it.
- Full standalone page for item detail. The detail view stays as an Angular Material dialog; the deep link navigates to the type-specific browse page (`/iot-hub/widgets`, `/iot-hub/dashboards`, etc.) and opens the dialog over it.
- Preview-specific install semantics. Install from preview reuses the same flow as a normal install; only the counter policy on the IoT Hub side may differ (see IoT Hub-side changes).

## User flows

### Published link: `/iot-hub/{itemId}`

1. User pastes or clicks `/iot-hub/{itemId}`.
2. Angular mounts `TbIotHubItemResolverComponent`.
3. Resolver calls `iotHubApiService.getPublishedVersion(itemId)` → IoT Hub `GET /api/items/{itemId}/published`.
4. On success, resolver navigates to `/iot-hub/{typeSegment(item.type)}` with router state `{ openItem: { version, preview: false } }` and `replaceUrl: true`.
5. `TbIotHubItemsPageComponent.ngOnInit` consumes `history.state.openItem`, resolves installed state, and calls `IotHubActionsService.openItemDetail(...)`.
6. The existing detail dialog opens with no visual changes.
7. On 404 or other error, resolver shows a toast and redirects to `/iot-hub`.

### Preview link: `/iot-hub/{itemId}/preview`

1. User pastes or clicks `/iot-hub/{itemId}/preview`.
2. `TbIotHubItemResolverComponent` mounts with `route.data.preview === true`.
3. Resolver calls `iotHubApiService.getLatestVersion(itemId)` → IoT Hub `GET /api/items/{itemId}/latest`.
4. If the resolved version `isPublished()` returns true (no draft exists; endpoint fell back to published), behave exactly like the published flow — no warning, no badge.
5. If the resolved version is unpublished, resolver opens `TbIotHubUnpublishedWarningDialogComponent` (`disableClose: true`).
   - Cancel → `router.navigate(['/iot-hub'])`.
   - "I understand the risk, continue" → resolver navigates to `/iot-hub/{typeSegment(item.type)}` with router state `{ openItem: { version, preview: true } }` and `replaceUrl: true`.
6. Type-page opens the detail dialog with `preview: true`; dialog renders an "Unpublished preview" badge next to the version in the sticky meta bar.
7. Install / Update / Remove / Open-entity actions behave identically to a published item. The preview badge is informational.

## Angular routing

Two routes added to `ui-ngx/src/app/modules/home/pages/iot-hub/iot-hub-routing.module.ts`, placed **after** all existing named child routes (`widgets`, `dashboards`, `solution-templates`, `calculated-fields`, `rule-chains`, `devices`, `search`, `installed`, `creator/:creatorId`) so the router matches reserved names before falling through to the wildcard:

```ts
{ path: ':itemId', component: TbIotHubItemResolverComponent,
  data: { auth: [Authority.TENANT_ADMIN], title: 'iot-hub.item-detail' } },
{ path: ':itemId/preview', component: TbIotHubItemResolverComponent,
  data: { auth: [Authority.TENANT_ADMIN], title: 'iot-hub.item-preview', preview: true } },
```

A UUID-shape check runs inside the resolver (not as a `UrlMatcher`) so an invalid `itemId` produces a friendly toast instead of a generic not-found page.

## Components

### `TbIotHubItemResolverComponent` (new)

Location: `ui-ngx/src/app/modules/home/pages/iot-hub/iot-hub-item-resolver.component.ts`.

- Standalone: `false`. Declared in `IotHubModule`.
- Template: empty (`template: ''`). The component renders nothing; it is a router-reachable controller.
- `ngOnInit`:
  1. Read `itemId` from route params, `preview` flag from route data.
  2. Reject non-UUID `itemId` → `iot-hub.deep-link-invalid-id` toast + redirect to `/iot-hub`.
  3. Dispatch to `getPublishedVersion` or `getLatestVersion` depending on `preview`.
  4. On error, map HTTP status to `iot-hub.deep-link-not-found` (404) or `iot-hub.deep-link-fetch-failed` (other) and redirect.
  5. On success, call `handleResolved(version, preview)`:
     - Preview + unpublished → open warning dialog; confirm routes to type-page with state; cancel routes to `/iot-hub`.
     - Otherwise → route directly to type-page with state.
- All navigations use `replaceUrl: true` so the resolver URL does not pollute browser history.

### `iot-hub-deep-link.utils.ts` (new)

Shared helpers:

```ts
export const isUUID = (s: string | null): s is string => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function typeSegment(t: ItemType): string | undefined {
  switch (t) {
    case ItemType.WIDGET: return 'widgets';
    case ItemType.DASHBOARD: return 'dashboards';
    case ItemType.SOLUTION_TEMPLATE: return 'solution-templates';
    case ItemType.CALCULATED_FIELD: return 'calculated-fields';
    case ItemType.RULE_CHAIN: return 'rule-chains';
    case ItemType.DEVICE: return 'devices';
    default: return undefined;
  }
}

export function isPublished(v: MpItemVersionView): boolean {
  return !!v.publishedTime && v.publishedTime > 0;
}
```

A `typeSegment` returning `undefined` (future `ItemType` values) surfaces as `iot-hub.deep-link-fetch-failed` in the resolver.

### `TbIotHubUnpublishedWarningDialogComponent` (new)

Location: `ui-ngx/src/app/modules/home/components/iot-hub/iot-hub-unpublished-warning-dialog.component.{ts,html,scss}`. Declared in `IotHubComponentsModule`.

- Title: translated `iot-hub.unpublished-warning-title` ("Unpublished content") with a red `warning` Material icon.
- Body: `iot-hub.unpublished-warning-text` paragraph ("This is a preview of unpublished content. It has not been reviewed by IoT Hub. Installing unverified content can introduce security and stability risks — only continue if you trust the creator.").
- Secondary line: `{item.name} • v {item.version}` so the user sees what they are acknowledging.
- Buttons:
  - `Cancel` — returns `false`.
  - `iot-hub.unpublished-warning-confirm` ("I understand the risk, continue") — returns `true`, styled with the project's danger accent.
- Dialog config: `panelClass: ['tb-dialog']`, `disableClose: true`, `autoFocus: false`.
- `MAT_DIALOG_DATA` payload: `{ item: MpItemVersionView }`.

Structural sibling of `TbIotHubDeleteDialogComponent`.

### `TbIotHubItemDetailDialogComponent` (modified)

- `IotHubItemDetailDialogData` gains optional `preview?: boolean`.
- Component stores `this.preview = data.preview === true` and exposes it to the template.
- Template adds a preview badge next to the existing version chip in the sticky meta bar:

  ```html
  <div class="tb-unpublished-preview-badge" *ngIf="preview">
    <mat-icon>warning</mat-icon>
    <span>{{ 'iot-hub.unpublished-preview' | translate }}</span>
  </div>
  ```

- No other template or behavior changes. Install / Update / Remove / Open-entity actions are untouched.
- SCSS adds `.tb-unpublished-preview-badge` (red-on-light-red, matching the warning dialog accent).

### `IotHubActionsService` (modified)

```ts
openItemDetail(
  item: MpItemVersionView,
  installedItem?: IotHubInstalledItem,
  installedItemsCount?: number,
  mode?: IotHubItemDetailDialogMode,
  showCreator?: boolean,
  preview?: boolean
): Observable<any>
```

`preview` is forwarded into `IotHubItemDetailDialogData`. All existing callers ignore the new parameter (undefined → non-preview).

### `TbIotHubItemsPageComponent` (modified)

`ngOnInit` is extended to consume `history.state.openItem` exactly once per navigation:

```ts
private maybeOpenDeepLinkedItem(): void {
  const openItem = history.state?.openItem as
    { version: MpItemVersionView; preview?: boolean } | undefined;
  if (!openItem || openItem.version.type !== this.config.type) return;

  history.replaceState({ ...history.state, openItem: undefined }, '');

  this.resolveInstalledItem(openItem.version).subscribe(installed => {
    this.iotHubActions.openItemDetail(
      openItem.version,
      installed,
      installed ? 1 : 0,
      'default',
      true,
      openItem.preview
    ).subscribe(result => this.handleDetailResult(result));
  });
}

private resolveInstalledItem(v: MpItemVersionView): Observable<IotHubInstalledItem | null> {
  return this.iotHubApiService
    .getInstalledItems(new PageLink(1), undefined, v.itemId)
    .pipe(map(page => page.data[0] ?? null));
}
```

`handleDetailResult` delegates to the same installed-count refresh logic already used by card clicks. The `history.replaceState` call clears `openItem` so a page refresh does not re-open the dialog from stale state.

## API contract

### `IotHubApiService` — new methods

```ts
public getPublishedVersion(itemId: string, config?: IotHubRequestConfig): Observable<MpItemVersionView> {
  return this.http.get<MpItemVersionView>(
    `${this.baseUrl}/api/items/${itemId}/published`,
    { params: this.buildParams(config) }
  );
}

public getLatestVersion(itemId: string, config?: IotHubRequestConfig): Observable<MpItemVersionView> {
  return this.http.get<MpItemVersionView>(
    `${this.baseUrl}/api/items/${itemId}/latest`,
    { params: this.buildParams(config) }
  );
}
```

Both accept `{ ignoreErrors: true }` so the resolver can handle failures inline rather than surfacing the global interceptor toast.

### ThingsBoard backend

Unchanged. `IotHubController.installVersion` and `IotHubController.updateInstalledItem` already operate on versionIds; the preview flow funnels into them without modification.

## i18n

Add to `ui-ngx/src/assets/locale/locale.constant-en_US.json` (and mirror into other locales):

- `iot-hub.item-detail` — "IoT Hub item"
- `iot-hub.item-preview` — "IoT Hub item preview"
- `iot-hub.unpublished-warning-title` — "Unpublished content"
- `iot-hub.unpublished-warning-text` — "This is a preview of unpublished content. It has not been reviewed by IoT Hub. Installing unverified content can introduce security and stability risks — only continue if you trust the creator."
- `iot-hub.unpublished-warning-confirm` — "I understand the risk, continue"
- `iot-hub.unpublished-preview` — "Unpublished preview"
- `iot-hub.deep-link-invalid-id` — "Invalid IoT Hub item link."
- `iot-hub.deep-link-not-found` — "This IoT Hub item doesn't exist or was removed."
- `iot-hub.deep-link-fetch-failed` — "Couldn't load IoT Hub item. Please try again."

## Edge cases

- **Invalid UUID shape** → `iot-hub.deep-link-invalid-id` toast + redirect to `/iot-hub`.
- **404 from IoT Hub** → `iot-hub.deep-link-not-found` toast + redirect.
- **Network / 5xx error** → `iot-hub.deep-link-fetch-failed` toast + redirect.
- **Preview URL resolves to a published version** (no draft exists) → no warning, no badge. Behaves identically to the published URL.
- **Unsupported `ItemType`** (future value not in `typeSegment`) → treated as `iot-hub.deep-link-fetch-failed`.
- **User hits Browser Back from the warning dialog** → dialog destroys with the resolver component; no zombie dialog.
- **User lacks `TENANT_ADMIN`** → the `/iot-hub` parent route guard blocks; no additional guard needed.
- **Preview for an already-installed item** → detail dialog shows its usual "Installed / Update / Open entity" actions against the unpublished versionId. Creators can test update and install-one-more flows end-to-end.
- **Refresh after deep link has been resolved** → URL is now `/iot-hub/{typePage}`; `history.state.openItem` is cleared; user sees the type-page with no dialog (expected).

## Testing

- `TbIotHubItemResolverComponent` unit tests with mocked `IotHubApiService` and `Router`:
  - published happy path
  - preview happy path (unpublished → warning → confirm)
  - preview warning cancel
  - preview resolves to published (no warning path)
  - invalid UUID
  - 404
  - 5xx / network error
  - unsupported `ItemType`
- `isPublished()` and `typeSegment()` unit tests.
- `TbIotHubUnpublishedWarningDialogComponent` component tests: renders item name/version; Cancel returns `false`; Confirm returns `true`.
- `TbIotHubItemsPageComponent.maybeOpenDeepLinkedItem` integration test with seeded `history.state`: asserts dialog opens, state is cleared, type mismatch is ignored.
- No ThingsBoard backend tests (no backend changes).

## Files touched

New:
- `ui-ngx/src/app/modules/home/pages/iot-hub/iot-hub-item-resolver.component.ts`
- `ui-ngx/src/app/modules/home/pages/iot-hub/iot-hub-deep-link.utils.ts`
- `ui-ngx/src/app/modules/home/components/iot-hub/iot-hub-unpublished-warning-dialog.component.ts`
- `ui-ngx/src/app/modules/home/components/iot-hub/iot-hub-unpublished-warning-dialog.component.html`
- `ui-ngx/src/app/modules/home/components/iot-hub/iot-hub-unpublished-warning-dialog.component.scss`

Modified:
- `ui-ngx/src/app/modules/home/pages/iot-hub/iot-hub-routing.module.ts`
- `ui-ngx/src/app/modules/home/pages/iot-hub/iot-hub.module.ts`
- `ui-ngx/src/app/modules/home/pages/iot-hub/iot-hub-items-page.component.ts`
- `ui-ngx/src/app/modules/home/components/iot-hub/iot-hub-components.module.ts`
- `ui-ngx/src/app/modules/home/components/iot-hub/iot-hub-item-detail-dialog.component.ts`
- `ui-ngx/src/app/modules/home/components/iot-hub/iot-hub-item-detail-dialog.component.html`
- `ui-ngx/src/app/modules/home/components/iot-hub/iot-hub-item-detail-dialog.component.scss`
- `ui-ngx/src/app/modules/home/components/iot-hub/iot-hub-actions.service.ts`
- `ui-ngx/src/app/core/http/iot-hub-api.service.ts`
- `ui-ngx/src/assets/locale/locale.constant-*.json`

## IoT Hub-side changes required

These live in the IoT Hub repository, not ThingsBoard CE. The frontend deep-link feature cannot ship end-to-end until they land.

1. **New endpoint** `GET /api/items/{itemId}/published`
   - Returns `MpItemVersionView` for the latest version of the item that is in the PUBLISHED state.
   - `404` when the item has no published version.
   - Anonymous cross-origin access (same CORS policy as `/api/versions/published`).
2. **New endpoint** `GET /api/items/{itemId}/latest`
   - Returns `MpItemVersionView` for the most relevant version regardless of state.
   - Ordering: prefer the latest non-published (DRAFT / PENDING_REVIEW / …) version; fall back to the latest published version if none is in flight.
   - `404` when the item has no versions at all.
   - Anonymous cross-origin access.
   - Soft-secret authorization model: the item UUID alone grants access.
3. **`MpItemVersionView` response for unpublished versions** must allow the frontend to tell published from unpublished. Either `publishedTime` must be falsy (`null` / `0`) for non-published versions, or an explicit `state` field must be added. Pick one; the frontend uses `isPublished(v)` based on `publishedTime` today.
4. **By-versionId endpoints must serve unpublished versions** when queried directly by ID:
   - `GET /api/versions/{versionId}`
   - `GET /api/versions/{versionId}/readme`
   - `GET /api/versions/{versionId}/fileData`
   - `POST /api/versions/{versionId}/install`
5. **Install counter policy**: decide whether `POST /api/versions/{versionId}/install` against an unpublished version increments counters. Recommended: skip, to avoid inflating published install metrics with creator self-tests.
6. **CORS**: ensure the two new endpoints permit cross-origin GET from any origin.
