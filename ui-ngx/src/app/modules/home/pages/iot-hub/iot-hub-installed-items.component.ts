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

import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { IotHubApiService } from '@core/http/iot-hub-api.service';
import { DialogService } from '@core/services/dialog.service';
import { TranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { ActionNotificationShow } from '@core/notification/notification.actions';
import { Subject } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
import { PageLink } from '@shared/models/page/page-link';
import { Direction, SortOrder } from '@shared/models/page/sort-order';
import { IotHubInstalledItem, ItemPublishedVersionInfo } from '@shared/models/iot-hub/iot-hub-installed-item.models';
import { ItemType, itemTypeTranslations } from '@shared/models/iot-hub/iot-hub-item.models';
import { EntityType } from '@shared/models/entity-type.models';
import { getEntityDetailsPageURL } from '@core/utils';
import { TbIotHubItemDetailDialogComponent, IotHubItemDetailDialogData } from '@home/components/iot-hub/iot-hub-item-detail-dialog.component';
import { TbIotHubUpdateDialogComponent, IotHubUpdateDialogData } from '@home/components/iot-hub/iot-hub-update-dialog.component';
import { TbIotHubDeleteDialogComponent, IotHubDeleteDialogData } from '@home/components/iot-hub/iot-hub-delete-dialog.component';
import { TbDeviceInstallDialogComponent, DeviceInstallDialogData } from '@home/components/iot-hub/device-install-dialog/device-install-dialog.component';
import { DeviceInstalledItemDescriptor } from '@shared/models/iot-hub/iot-hub-installed-item.models';

@Component({
  selector: 'tb-iot-hub-installed-items',
  standalone: false,
  templateUrl: './iot-hub-installed-items.component.html',
  styleUrls: ['./iot-hub-installed-items.component.scss']
})
export class TbIotHubInstalledItemsComponent implements OnInit, AfterViewInit, OnDestroy {

  displayedColumns: string[] = ['itemName', 'itemType', 'version', 'createdTime', 'updates', 'actions'];
  dataSource: IotHubInstalledItem[] = [];
  totalElements = 0;
  pageSize = 10;
  hidePageSize = false;

  private widgetResize$: ResizeObserver;
  pageIndex = 0;
  isLoading = false;
  textSearch = '';

  publishedVersionMap = new Map<string, ItemPublishedVersionInfo>();
  updatesChecked = false;
  isCheckingUpdates = false;

  // Type filter
  filterOpen = false;
  activeTypeFilters = new Set<string>();
  allItemTypes: string[] = ['WIDGET', 'DASHBOARD', 'SOLUTION_TEMPLATE', 'CALCULATED_FIELD', 'RULE_CHAIN', 'DEVICE'];

  private searchSubject = new Subject<string>();

  @ViewChild(MatSort, {static: true}) sort: MatSort;
  @ViewChild(MatPaginator, {static: true}) paginator: MatPaginator;

  constructor(
    private iotHubApiService: IotHubApiService,
    private dialogService: DialogService,
    private translate: TranslateService,
    private store: Store<AppState>,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private elementRef: ElementRef,
    private zone: NgZone,
    private cd: ChangeDetectorRef
  ) {
    this.widgetResize$ = new ResizeObserver(() => {
      this.zone.run(() => {
        const shouldHide = this.elementRef.nativeElement.offsetWidth < 640;
        if (shouldHide !== this.hidePageSize) {
          this.hidePageSize = shouldHide;
          this.cd.markForCheck();
        }
      });
    });
    this.widgetResize$.observe(this.elementRef.nativeElement);
  }

  ngOnInit(): void {
    const itemType = this.route.snapshot.queryParamMap.get('itemType');
    if (itemType && this.allItemTypes.includes(itemType)) {
      this.activeTypeFilters.add(itemType);
    }
    this.searchSubject.pipe(
      debounceTime(300)
    ).subscribe(() => {
      this.pageIndex = 0;
      this.paginator.pageIndex = 0;
      this.loadData();
    });
    this.loadData();
  }

  ngOnDestroy(): void {
    this.widgetResize$?.disconnect();
  }

  ngAfterViewInit(): void {
    this.sort.sortChange.subscribe(() => {
      this.pageIndex = 0;
      this.paginator.pageIndex = 0;
      this.loadData();
    });
  }

  navigateToMarketplace(): void {
    this.router.navigate(['/iot-hub']);
  }

  onSearchChange(value: string): void {
    this.textSearch = value;
    this.searchSubject.next(value);
  }

  onPageChange(event: any): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadData();
  }

  toggleFilter(): void {
    this.filterOpen = !this.filterOpen;
  }

  isTypeFilterActive(type: string): boolean {
    return this.activeTypeFilters.has(type);
  }

  toggleTypeFilter(type: string): void {
    if (this.activeTypeFilters.has(type)) {
      this.activeTypeFilters.delete(type);
    } else {
      this.activeTypeFilters.add(type);
    }
    this.pageIndex = 0;
    this.loadData();
  }

  removeTypeFilter(type: string): void {
    this.activeTypeFilters.delete(type);
    this.pageIndex = 0;
    this.loadData();
  }

  clearAllFilters(): void {
    this.activeTypeFilters.clear();
    this.pageIndex = 0;
    this.loadData();
  }

  hasActiveFilters(): boolean {
    return this.activeTypeFilters.size > 0;
  }

  getItemTypeIcon(itemType: string): string {
    switch (itemType) {
      case 'WIDGET': return 'widgets';
      case 'DASHBOARD': return 'dashboard';
      case 'SOLUTION_TEMPLATE': return 'integration_instructions';
      case 'CALCULATED_FIELD': return 'functions';
      case 'RULE_CHAIN': return 'settings_ethernet';
      case 'DEVICE': return 'memory';
      default: return 'category';
    }
  }

  deleteItem(item: IotHubInstalledItem): void {
    const dialogRef = this.dialog.open(TbIotHubDeleteDialogComponent, {
      panelClass: ['tb-dialog'],
      autoFocus: false,
      data: { itemName: item.itemName, itemType: item.itemType } as IotHubDeleteDialogData
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.iotHubApiService.deleteInstalledItem(item.id.id).subscribe({
          next: () => {
            this.store.dispatch(new ActionNotificationShow({
              message: this.translate.instant('iot-hub.installed-item-removed', {name: item.itemName}),
              type: 'success',
              duration: 3000
            }));
            this.loadData();
          },
          error: () => {
            this.store.dispatch(new ActionNotificationShow({
              message: this.translate.instant('iot-hub.installed-item-remove-error', {name: item.itemName}),
              type: 'error',
              duration: 5000
            }));
          }
        });
      }
    });
  }

  getItemTypeLabel(itemType: string): string {
    const key = itemTypeTranslations.get(itemType as ItemType);
    return key ? this.translate.instant(key) : itemType;
  }

  getItemTypeChipClass(itemType: string): string {
    switch (itemType) {
      case 'WIDGET': return 'tb-type-widget';
      case 'DASHBOARD': return 'tb-type-dashboard';
      case 'CALCULATED_FIELD': return 'tb-type-calc-field';
      case 'RULE_CHAIN': return 'tb-type-rule-chain';
      case 'DEVICE': return 'tb-type-device';
      case 'SOLUTION_TEMPLATE': return 'tb-type-solution-template';
      default: return '';
    }
  }

  viewItemDetails(item: IotHubInstalledItem): void {
    if (item.itemType === 'DEVICE') {
      this.openDeviceReviewDialog(item);
      return;
    }
    this.iotHubApiService.getVersionInfo(item.itemVersionId, {ignoreLoading: true}).subscribe(versionView => {
      const dialogRef = this.dialog.open(TbIotHubItemDetailDialogComponent, {
        panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
        autoFocus: false,
        data: {
          item: versionView,
          installedItem: item
        } as IotHubItemDetailDialogData
      });
      dialogRef.afterClosed().subscribe(result => {
        if (result === 'updated' || result === 'deleted') {
          this.loadData();
        }
      });
    });
  }

  private openDeviceReviewDialog(item: IotHubInstalledItem): void {
    const descriptor = item.descriptor as DeviceInstalledItemDescriptor;
    if (!descriptor.installState || !descriptor.selectedInstallMethod) {
      // No install state — fall back to regular detail dialog
      this.iotHubApiService.getVersionInfo(item.itemVersionId, {ignoreLoading: true}).subscribe(versionView => {
        this.dialog.open(TbIotHubItemDetailDialogComponent, {
          panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
          autoFocus: false,
          data: { item: versionView, installedItem: item } as IotHubItemDetailDialogData
        });
      });
      return;
    }
    this.iotHubApiService.getVersionFileData(item.itemVersionId, { ignoreLoading: true, ignoreErrors: true }).subscribe({
      next: async (blob: Blob) => {
        const zipData = await blob.arrayBuffer();
        this.iotHubApiService.getVersionInfo(item.itemVersionId, {ignoreLoading: true, ignoreErrors: true}).subscribe(versionView => {
          this.dialog.open(TbDeviceInstallDialogComponent, {
            panelClass: ['tb-dialog', 'tb-fullscreen-dialog-lt-md'],
            disableClose: false,
            autoFocus: false,
            data: {
              item: versionView,
              zipData,
              reviewMode: true,
              selectedInstallMethod: descriptor.selectedInstallMethod,
              installState: descriptor.installState
            } as DeviceInstallDialogData
          });
        });
      }
    });
  }

  getEntityId(item: IotHubInstalledItem): string | null {
    const descriptor = item.descriptor;
    switch (descriptor.type) {
      case 'WIDGET': return descriptor.widgetTypeId?.id;
      case 'DASHBOARD': return descriptor.dashboardId?.id;
      case 'CALCULATED_FIELD': return descriptor.entityId?.id;
      case 'RULE_CHAIN': return descriptor.ruleChainId?.id;
      case 'DEVICE': return descriptor.dashboardId?.id ?? null;
      case 'SOLUTION_TEMPLATE': return descriptor.dashboardId?.id;
      default: return null;
    }
  }

  getEntityType(item: IotHubInstalledItem): EntityType | null {
    const descriptor = item.descriptor;
    switch (descriptor.type) {
      case 'WIDGET': return EntityType.WIDGET_TYPE;
      case 'DASHBOARD': return EntityType.DASHBOARD;
      case 'CALCULATED_FIELD': return descriptor.entityId?.entityType as EntityType;
      case 'RULE_CHAIN': return EntityType.RULE_CHAIN;
      case 'DEVICE': return descriptor.dashboardId ? EntityType.DASHBOARD : null;
      case 'SOLUTION_TEMPLATE': return EntityType.DASHBOARD;
      default: return null;
    }
  }

  openEntity(item: IotHubInstalledItem): void {
    const entityType = this.getEntityType(item);
    const entityId = this.getEntityId(item);
    if (entityType && entityId) {
      const url = getEntityDetailsPageURL(entityId, entityType);
      if (url) {
        this.router.navigateByUrl(url);
      }
    }
  }

  checkForUpdates(): void {
    this.isCheckingUpdates = true;
    this.iotHubApiService.getInstalledItemIds({ ignoreLoading: true }).pipe(
      switchMap(itemIds => this.iotHubApiService.getItemsPublishedVersions(itemIds, { ignoreLoading: true }))
    ).subscribe({
      next: (infos) => {
        this.publishedVersionMap.clear();
        infos.forEach(info => this.publishedVersionMap.set(info.itemId, info));
        this.updatesChecked = true;
        this.isCheckingUpdates = false;
      },
      error: () => {
        this.isCheckingUpdates = false;
      }
    });
  }

  viewUpdateDetails(publishedInfo: ItemPublishedVersionInfo, installedItem: IotHubInstalledItem): void {
    this.iotHubApiService.getVersionInfo(publishedInfo.publishedVersionId, {ignoreLoading: true}).subscribe(versionView => {
      const dialogRef = this.dialog.open(TbIotHubItemDetailDialogComponent, {
        panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
        autoFocus: false,
        data: {
          item: versionView,
          installedItem
        } as IotHubItemDetailDialogData
      });
      dialogRef.afterClosed().subscribe(result => {
        if (result === 'updated' || result === 'deleted') {
          this.loadData();
        }
      });
    });
  }

  updateItem(item: IotHubInstalledItem, publishedInfo: ItemPublishedVersionInfo): void {
    const dialogRef = this.dialog.open(TbIotHubUpdateDialogComponent, {
      panelClass: ['tb-dialog'],
      data: {
        installedItemId: item.id.id,
        itemName: item.itemName,
        itemType: item.itemType as ItemType,
        version: publishedInfo.publishedVersion,
        versionId: publishedInfo.publishedVersionId,
      } as IotHubUpdateDialogData
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result === 'updated') {
        this.loadData();
      }
    });
  }

  getPublishedVersionInfo(item: IotHubInstalledItem): ItemPublishedVersionInfo | undefined {
    return this.publishedVersionMap.get(item.itemId);
  }

  private loadData(): void {
    this.isLoading = true;
    const sortOrder: SortOrder = {
      property: this.sort?.active || 'createdTime',
      direction: this.sort?.direction === 'asc' ? Direction.ASC : Direction.DESC
    };
    const pageLink = new PageLink(this.pageSize, this.pageIndex, this.textSearch || null, sortOrder);
    const typeFilters = this.activeTypeFilters.size > 0 ? Array.from(this.activeTypeFilters) : null;
    this.iotHubApiService.getInstalledItems(pageLink, typeFilters, {ignoreLoading: true}).subscribe({
      next: (data) => {
        this.dataSource = data.data;
        this.totalElements = data.totalElements;
        this.isLoading = false;
      },
      error: () => {
        this.dataSource = [];
        this.totalElements = 0;
        this.isLoading = false;
      }
    });
  }
}
