///
/// Copyright © 2016-2026 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, TemplateRef, ViewChild, ViewEncapsulation } from '@angular/core';
import { WidgetsBundle } from '@shared/models/widgets-bundle.model';
import { IAliasController } from '@core/api/widget-api.models';
import { NULL_UUID } from '@shared/models/id/has-uuid';
import { WidgetService } from '@core/http/widget.service';
import {
  DeprecatedFilter,
  fullWidgetTypeFqn,
  WidgetInfo,
  widgetType,
  WidgetTypeInfo
} from '@shared/models/widget.models';
import { debounceTime, distinctUntilChanged, map, skip, switchMap } from 'rxjs/operators';
import { BehaviorSubject, combineLatest, forkJoin, of } from 'rxjs';
import { isObject } from '@core/utils';
import { PageLink } from '@shared/models/page/page-link';
import { Direction, SortOrder } from '@shared/models/page/sort-order';
import { GridEntitiesFetchFunction, ScrollGridColumns } from '@shared/components/grid/scroll-grid-datasource';
import { ItemSizeStrategy } from '@shared/components/grid/scroll-grid.component';
import { coerceBoolean } from '@shared/decorators/coercion';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { MpItemVersionQuery, MpItemVersionView, widgetTypeTranslations } from '@shared/models/iot-hub/iot-hub-version.models';
import { ItemType, FilterParamInfo } from '@shared/models/iot-hub/iot-hub-item.models';
import { IotHubInstalledItem } from '@shared/models/iot-hub/iot-hub-installed-item.models';
import { IotHubApiService } from '@core/http/iot-hub-api.service';
import {
  TbIotHubItemDetailDialogComponent,
  IotHubItemDetailDialogData
} from '@home/components/iot-hub/iot-hub-item-detail-dialog.component';

type selectWidgetMode = 'bundles' | 'allWidgets' | 'iotHub';

interface WidgetsFilter {
  search: string;
  filter: widgetType[];
  deprecatedFilter: DeprecatedFilter;
}

interface BundleWidgetsFilter extends WidgetsFilter {
  widgetsBundleId: string;
}

@Component({
    selector: 'tb-dashboard-widget-select',
    templateUrl: './dashboard-widget-select.component.html',
    styleUrls: ['./dashboard-widget-select.component.scss'],
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class DashboardWidgetSelectComponent implements OnInit {

  private searchSubject = new BehaviorSubject<string>('');
  private search$ = this.searchSubject.asObservable().pipe(
    debounceTime(150));

  private filterWidgetTypes$ = new BehaviorSubject<Array<widgetType>>(null);
  private deprecatedFilter$ = new BehaviorSubject<DeprecatedFilter>(DeprecatedFilter.ACTUAL);
  private selectWidgetMode$ = new BehaviorSubject<selectWidgetMode>('bundles');
  private widgetsBundle$ = new BehaviorSubject<WidgetsBundle>(null);

  widgetTypes = new Set<widgetType>();
  hasDeprecated = false;

  @Input()
  aliasController: IAliasController;

  @Input()
  @coerceBoolean()
  scadaFirst = false;

  @Input()
  set search(search: string) {
    this.searchSubject.next(search);
  }

  get search(): string {
    return this.searchSubject.value;
  }

  @Input()
  set filterWidgetTypes(widgetTypes: Array<widgetType>) {
    this.filterWidgetTypes$.next(widgetTypes);
  }

  get filterWidgetTypes(): Array<widgetType> {
    return this.filterWidgetTypes$.value;
  }

  @Input()
  set selectWidgetMode(mode: selectWidgetMode) {
    if (this.selectWidgetMode$.value !== mode) {
      if (mode === 'bundles' && this.widgetsBundle$.value === null) {
        this.widgetTypes.clear();
        this.hasDeprecated = false;
      } else {
        this.widgetTypes = new Set<widgetType>(Object.keys(widgetType).map(t => t as widgetType));
        this.hasDeprecated = true;
      }
      this.filterWidgetTypes$.next(null);
      this.deprecatedFilter$.next(DeprecatedFilter.ACTUAL);
      this.selectWidgetMode$.next(mode);
      if (mode === 'iotHub') {
        this.loadInstalledWidgets();
        this.loadIotHubFilterInfo();
      } else {
        this.iotHubInstalledMode = 'all';
        this.installedWidgetVersions = null;
        this.appliedWidgetTypes.clear();
        this.appliedCategories.clear();
        this.appliedUseCases.clear();
        this.iotHubFilterCount = 0;
      }
    }
  }

  get selectWidgetMode(): selectWidgetMode {
    return this.selectWidgetMode$.value;
  }

  @Input()
  set deprecatedFilter(filter: DeprecatedFilter) {
    this.deprecatedFilter$.next(filter);
  }

  get deprecatedFilter(): DeprecatedFilter {
    return this.deprecatedFilter$.value;
  }

  set widgetsBundle(widgetBundle: WidgetsBundle) {
    if (this.widgetsBundle$.value !== widgetBundle) {
      if (widgetBundle === null && this.selectWidgetMode$.value !== 'allWidgets') {
        this.widgetTypes.clear();
        this.hasDeprecated = false;
      } else {
        this.widgetTypes = new Set<widgetType>(Object.keys(widgetType).map(t => t as widgetType));
        this.hasDeprecated = true;
      }
      this.filterWidgetTypes$.next(null);
      this.deprecatedFilter$.next(DeprecatedFilter.ACTUAL);
      this.widgetsBundle$.next(widgetBundle);
    }
  }

  get widgetsBundle(): WidgetsBundle {
    return this.widgetsBundle$.value;
  }

  @ViewChild('iotHubFilterPanel', {static: true}) iotHubFilterPanel: TemplateRef<void>;

  @Output()
  widgetSelected: EventEmitter<WidgetInfo> = new EventEmitter<WidgetInfo>();

  columns: ScrollGridColumns = {
    columns: 2,
    breakpoints: {
      'screen and (min-width: 2000px)': 5,
      'screen and (min-width: 1097px)': 4,
      'gt-sm': 3,
      'screen and (min-width: 721px)': 4,
      'screen and (min-width: 485px)': 3
    }
  };

  gridWidgetsItemSizeStrategy: ItemSizeStrategy = {
    defaultItemSize: 160,
    itemSizeFunction: itemWidth => (itemWidth - 24) * 0.8 + 76
  };

  widgetBundlesFetchFunction: GridEntitiesFetchFunction<WidgetsBundle, string>;
  allWidgetsFetchFunction: GridEntitiesFetchFunction<WidgetTypeInfo, WidgetsFilter>;
  widgetsFetchFunction: GridEntitiesFetchFunction<WidgetTypeInfo, BundleWidgetsFilter>;
  iotHubWidgetsFetchFunction: GridEntitiesFetchFunction<MpItemVersionView, string>;

  widgetsBundleFilter = '';
  allWidgetsFilter: WidgetsFilter = {search: '', filter: null, deprecatedFilter: DeprecatedFilter.ACTUAL};
  widgetsFilter: BundleWidgetsFilter = {search: '', filter: null, deprecatedFilter: DeprecatedFilter.ACTUAL, widgetsBundleId: null};
  iotHubWidgetsFilter = '';
  iotHubInstalledMode: 'all' | 'installed' = 'all';
  iotHubInstalledWidgetsFetchFunction: GridEntitiesFetchFunction<MpItemVersionView, string>;
  private installedWidgets: IotHubInstalledItem[] = null;
  private installedWidgetVersions: MpItemVersionView[] = null;
  iotHubInstalledWidgetsFilter = '';

  // IoT Hub filter model — applied state (used by fetch functions)
  private appliedWidgetTypes = new Set<string>();
  private appliedCategories = new Set<string>();
  private appliedUseCases = new Set<string>();

  // IoT Hub filter model — pending state (used by filter panel UI)
  iotHubPendingWidgetTypes = new Set<string>();
  iotHubPendingCategories = new Set<string>();
  iotHubPendingUseCases = new Set<string>();
  iotHubFilterDirty = false;

  iotHubWidgetTypeOptions: FilterParamInfo[] = [];
  iotHubCategoryOptions: FilterParamInfo[] = [];
  iotHubUseCaseOptions: FilterParamInfo[] = [];
  iotHubFilterCount = 0;

  constructor(private widgetsService: WidgetService,
              private iotHubApiService: IotHubApiService,
              private translate: TranslateService,
              private dialog: MatDialog,
              private cd: ChangeDetectorRef) {

    this.widgetBundlesFetchFunction = (pageSize, page, filter) => {
      const pageLink = new PageLink(pageSize, page, filter, {
        property: 'title',
        direction: Direction.ASC
      });
      return this.widgetsService.getWidgetBundles(pageLink, true, false, this.scadaFirst);
    };

    this.allWidgetsFetchFunction = (pageSize, page, filter) => {
      const pageLink = new PageLink(pageSize, page, filter.search, {
        property: 'name',
        direction: Direction.ASC
      });
      return this.widgetsService.getWidgetTypes(pageLink, false, true, this.scadaFirst,
        filter.deprecatedFilter, filter.filter);
    };

    this.widgetsFetchFunction = (pageSize, page, filter) => {
      const pageLink = new PageLink(pageSize, page, filter.search, {
        property: 'name',
        direction: Direction.ASC
      });
      return this.widgetsService.getBundleWidgetTypeInfos(pageLink, filter.widgetsBundleId,
        true, filter.deprecatedFilter, filter.filter);
    };

    this.iotHubWidgetsFetchFunction = (pageSize, page, filter) => {
      const search = typeof filter === 'string' ? filter.split('|')[0] : filter;
      const sortOrder: SortOrder = { property: 'totalInstallCount', direction: Direction.DESC };
      const pageLink = new PageLink(pageSize, page, search || null, sortOrder);
      const query = new MpItemVersionQuery(pageLink, ItemType.WIDGET,
        undefined, undefined,
        this.appliedCategories.size > 0 ? Array.from(this.appliedCategories) : undefined,
        this.appliedUseCases.size > 0 ? Array.from(this.appliedUseCases) : undefined,
        undefined,
        this.appliedWidgetTypes.size > 0 ? Array.from(this.appliedWidgetTypes) : undefined
      );
      return this.iotHubApiService.getPublishedVersions(query, { ignoreLoading: true });
    };

    this.iotHubInstalledWidgetsFetchFunction = (pageSize, page, filter) => {
      if (this.installedWidgetVersions === null) {
        return this.fetchInstalledWidgetVersions().pipe(
          map(versions => this.filterAndPaginateInstalledVersions(versions, pageSize, page, filter))
        );
      }
      return of(this.filterAndPaginateInstalledVersions(this.installedWidgetVersions, pageSize, page, filter));
    };

    this.search$.pipe(
      distinctUntilChanged(),
      skip(1)
    ).subscribe(
      (search) => {
        this.widgetsBundleFilter = search;
        if (this.selectWidgetMode$.value === 'iotHub') {
          if (this.iotHubInstalledMode === 'installed') {
            this.iotHubInstalledWidgetsFilter = search;
          } else {
            this.iotHubWidgetsFilter = search;
          }
        }
        this.cd.markForCheck();
      }
    );

    combineLatest({search: this.search$, filter: this.filterWidgetTypes$.asObservable(),
      deprecatedFilter: this.deprecatedFilter$.asObservable()}).pipe(
      distinctUntilChanged((oldValue, newValue) => JSON.stringify(oldValue) === JSON.stringify(newValue)),
      skip(1)
    ).subscribe(
      (filter) => {
        this.allWidgetsFilter = filter;
        this.cd.markForCheck();
      }
    );

    combineLatest({search: this.search$, widgetsBundleId: this.widgetsBundle$.pipe(map(wb => wb !== null ? wb.id.id : null)),
      filter: this.filterWidgetTypes$.asObservable(), deprecatedFilter: this.deprecatedFilter$.asObservable()}).pipe(
      distinctUntilChanged((oldValue, newValue) => JSON.stringify(oldValue) === JSON.stringify(newValue)),
      skip(1)
    ).subscribe(
      (filter) => {
        if (filter.widgetsBundleId) {
          this.widgetsFilter = filter;
          this.cd.markForCheck();
        }
      }
    );
  }

  ngOnInit(): void {
  }

  onWidgetClicked($event: Event, widget: WidgetTypeInfo): void {
    this.widgetSelected.emit(this.toWidgetInfo(widget));
  }

  isSystem(item: WidgetsBundle): boolean {
    return item && item.tenantId.id === NULL_UUID;
  }

  selectBundle($event: Event, bundle: WidgetsBundle) {
    $event.preventDefault();
    this.widgetsBundle = bundle;
    if (bundle.title?.toLowerCase().includes(this.search.toLowerCase()) ||
      bundle.description?.toLowerCase().includes(this.search.toLowerCase())) {
      this.searchSubject.next('');
    }
  }

  onIotHubWidgetClicked($event: Event, item: MpItemVersionView): void {
    $event.preventDefault();
    const installedItem = this.installedWidgets?.find(i => i.itemId === item.itemId);
    if (installedItem) {
      const widgetTypeId = installedItem.descriptor?.type === 'WIDGET' ? installedItem.descriptor.widgetTypeId?.id : null;
      if (widgetTypeId) {
        this.widgetsService.getWidgetTypeInfoById(widgetTypeId).subscribe(wt => {
          if (wt) {
            this.widgetSelected.emit({
              typeFullFqn: fullWidgetTypeFqn(wt),
              type: wt.widgetType,
              title: wt.name,
              image: wt.image,
              description: wt.description,
              deprecated: wt.deprecated
            });
          }
        });
      }
      return;
    }
    const dialogRef = this.dialog.open(TbIotHubItemDetailDialogComponent, {
      panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
      autoFocus: false,
      data: {
        item,
        mode: 'add'
      } as IotHubItemDetailDialogData
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result?.action === 'add') {
        this.installAndAddWidget(result.item);
      }
    });
  }

  isIotHubWidgetInstalled(item: MpItemVersionView): boolean {
    return this.installedWidgets?.some(i => i.itemId === item.itemId) ?? false;
  }

  getIotHubItemImage(item: MpItemVersionView): string | null {
    if (item.image) {
      return this.iotHubApiService.resolveResourceUrl(item.image);
    }
    const resource = item.resources?.find(r => r.type === 'SCREENSHOT') || item.resources?.find(r => r.type === 'ICON');
    if (resource) {
      return this.iotHubApiService.resolveResourceUrl(`/api/resources/${resource.id}`);
    }
    return null;
  }

  onIotHubInstalledModeChange(mode: 'all' | 'installed'): void {
    this.iotHubInstalledMode = mode;
    const search = this.searchSubject.value;
    if (mode === 'installed') {
      this.installedWidgetVersions = null;
      this.iotHubInstalledWidgetsFilter = search;
    } else {
      this.iotHubWidgetsFilter = search;
    }
    this.cd.markForCheck();
  }

  openIotHubFilterPanel(): void {
    this.iotHubPendingWidgetTypes = new Set(this.appliedWidgetTypes);
    this.iotHubPendingCategories = new Set(this.appliedCategories);
    this.iotHubPendingUseCases = new Set(this.appliedUseCases);
    this.iotHubFilterDirty = false;
  }

  getIotHubWidgetTypeLabel(key: string): string {
    const translationKey = widgetTypeTranslations.get(key);
    return translationKey ? this.translate.instant(translationKey) : key;
  }

  toggleIotHubWidgetType(key: string): void {
    if (this.iotHubPendingWidgetTypes.has(key)) {
      this.iotHubPendingWidgetTypes.delete(key);
    } else {
      this.iotHubPendingWidgetTypes.add(key);
    }
    this.updateFilterDirty();
  }

  toggleIotHubCategory(key: string): void {
    if (this.iotHubPendingCategories.has(key)) {
      this.iotHubPendingCategories.delete(key);
    } else {
      this.iotHubPendingCategories.add(key);
    }
    this.updateFilterDirty();
  }

  toggleIotHubUseCase(key: string): void {
    if (this.iotHubPendingUseCases.has(key)) {
      this.iotHubPendingUseCases.delete(key);
    } else {
      this.iotHubPendingUseCases.add(key);
    }
    this.updateFilterDirty();
  }

  clearIotHubFilters(): void {
    this.iotHubPendingWidgetTypes.clear();
    this.iotHubPendingCategories.clear();
    this.iotHubPendingUseCases.clear();
    this.updateFilterDirty();
  }

  applyIotHubFilters(): void {
    this.appliedWidgetTypes = new Set(this.iotHubPendingWidgetTypes);
    this.appliedCategories = new Set(this.iotHubPendingCategories);
    this.appliedUseCases = new Set(this.iotHubPendingUseCases);
    this.iotHubFilterCount = this.appliedWidgetTypes.size + this.appliedCategories.size + this.appliedUseCases.size;
    this.iotHubFilterDirty = false;
    this.reloadIotHubWidgets();
  }

  private updateFilterDirty(): void {
    this.iotHubFilterDirty =
      !this.setsEqual(this.iotHubPendingWidgetTypes, this.appliedWidgetTypes) ||
      !this.setsEqual(this.iotHubPendingCategories, this.appliedCategories) ||
      !this.setsEqual(this.iotHubPendingUseCases, this.appliedUseCases);
  }

  private setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) { return false; }
    for (const v of a) {
      if (!b.has(v)) { return false; }
    }
    return true;
  }

  private reloadIotHubWidgets(): void {
    if (this.iotHubInstalledMode === 'installed') {
      this.installedWidgetVersions = null;
      this.iotHubInstalledWidgetsFilter = this.searchSubject.value + '|' + Date.now();
    } else {
      this.iotHubWidgetsFilter = this.searchSubject.value + '|' + Date.now();
    }
    this.cd.markForCheck();
  }

  isObject(value: any): boolean {
    return isObject(value);
  }

  private installAndAddWidget(item: MpItemVersionView): void {
    const versionId = item.id as string;
    this.iotHubApiService.installItemVersion(versionId, { ignoreLoading: true }).subscribe({
      next: (result) => {
        if (result.success && result.descriptor?.type === 'WIDGET') {
          this.loadInstalledWidgets();
          const widgetTypeId = result.descriptor.widgetTypeId?.id;
          if (widgetTypeId) {
            this.widgetsService.getWidgetTypeInfoById(widgetTypeId).subscribe(wt => {
              if (wt) {
                this.widgetSelected.emit(this.toWidgetInfo(wt));
              }
            });
          }
        }
      }
    });
  }

  private loadIotHubFilterInfo(): void {
    this.iotHubApiService.getFilterInfo(ItemType.WIDGET, { ignoreLoading: true }).subscribe(info => {
      this.iotHubWidgetTypeOptions = info.types || [];
      this.iotHubCategoryOptions = info.categories || [];
      this.iotHubUseCaseOptions = info.useCases || [];
    });
  }

  private loadInstalledWidgets(): void {
    if (this.installedWidgets === null) {
      this.installedWidgets = [];
    }
    const pageLink = new PageLink(10000, 0);
    this.iotHubApiService.getInstalledItems(pageLink, ItemType.WIDGET, { ignoreLoading: true }).subscribe(data => {
      this.installedWidgets = data.data;
    });
  }

  private fetchInstalledWidgetVersions() {
    const itemIds = (this.installedWidgets || []).map(i => i.itemId);
    if (itemIds.length === 0) {
      this.installedWidgetVersions = [];
      return of([]);
    }
    return this.iotHubApiService.getItemsPublishedVersions(itemIds, { ignoreLoading: true }).pipe(
      switchMap(infos => {
        if (infos.length === 0) {
          return of([]);
        }
        const versionRequests = infos.map(info =>
          this.iotHubApiService.getVersionInfo(info.publishedVersionId, { ignoreLoading: true })
        );
        return forkJoin(versionRequests);
      }),
      map(versions => {
        this.installedWidgetVersions = versions.sort((a, b) => b.totalInstallCount - a.totalInstallCount);
        return this.installedWidgetVersions;
      })
    );
  }

  private filterAndPaginateInstalledVersions(versions: MpItemVersionView[], pageSize: number, page: number, filter: string) {
    let filtered = versions;
    const search = typeof filter === 'string' ? filter.split('|')[0] : '';
    if (search) {
      filtered = filtered.filter(v => v.name.toLowerCase().includes(search.toLowerCase()));
    }
    if (this.appliedWidgetTypes.size > 0) {
      filtered = filtered.filter(v => this.appliedWidgetTypes.has(v.dataDescriptor?.widgetType));
    }
    if (this.appliedCategories.size > 0) {
      filtered = filtered.filter(v => v.categories?.some(c => this.appliedCategories.has(c)));
    }
    if (this.appliedUseCases.size > 0) {
      filtered = filtered.filter(v => v.useCases?.some(u => this.appliedUseCases.has(u)));
    }
    const start = page * pageSize;
    const data = filtered.slice(start, start + pageSize);
    return { data, totalPages: Math.ceil(filtered.length / pageSize), totalElements: filtered.length, hasNext: start + pageSize < filtered.length };
  }

  private toWidgetInfo(widgetTypeInfo: WidgetTypeInfo): WidgetInfo {
    return {
      typeFullFqn: fullWidgetTypeFqn(widgetTypeInfo),
      type: widgetTypeInfo.widgetType,
      title: widgetTypeInfo.name,
      image: widgetTypeInfo.image,
      description: widgetTypeInfo.description,
      deprecated: widgetTypeInfo.deprecated
    };
  }
}
