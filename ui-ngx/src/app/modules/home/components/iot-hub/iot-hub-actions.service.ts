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

import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, EMPTY } from 'rxjs';
import { filter, mergeMap } from 'rxjs/operators';
import { MpItemVersionView } from '@shared/models/iot-hub/iot-hub-version.models';
import { ItemType } from '@shared/models/iot-hub/iot-hub-item.models';
import { IotHubInstalledItem } from '@shared/models/iot-hub/iot-hub-installed-item.models';
import { IotHubApiService } from '@core/http/iot-hub-api.service';
import { EntityId } from '@shared/models/id/entity-id';
import { TbIotHubAddItemDialogComponent, IotHubAddItemDialogData, IotHubAddItemDialogResult } from './iot-hub-add-item-dialog.component';
import { TbIotHubItemDetailDialogComponent, IotHubItemDetailDialogData, IotHubItemDetailDialogMode } from './iot-hub-item-detail-dialog.component';
import { TbIotHubInstallDialogComponent, IotHubInstallDialogData } from './iot-hub-install-dialog.component';
import { TbIotHubUpdateDialogComponent, IotHubUpdateDialogData } from './iot-hub-update-dialog.component';
import { TbIotHubDeleteDialogComponent, IotHubDeleteDialogData } from './iot-hub-delete-dialog.component';
import { TbDeviceInstallDialogComponent, DeviceInstallDialogData } from './device-install-dialog/device-install-dialog.component';

@Injectable()
export class IotHubActionsService {

  constructor(
    private dialog: MatDialog,
    private iotHubApiService: IotHubApiService
  ) {}

  openItemDetail(item: MpItemVersionView, installedItem?: IotHubInstalledItem,
                 mode?: IotHubItemDetailDialogMode, showCreator?: boolean): Observable<any> {
    return this.dialog.open(TbIotHubItemDetailDialogComponent, {
      panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
      autoFocus: false,
      data: { item, installedItem, mode, showCreator } as IotHubItemDetailDialogData
    }).afterClosed();
  }

  addItem(itemType: ItemType, options?: { itemSubType?: string; entityId?: EntityId }): Observable<IotHubAddItemDialogResult> {
    return this.dialog.open(TbIotHubAddItemDialogComponent, {
      panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
      disableClose: true,
      autoFocus: false,
      data: {
        itemType,
        itemSubType: options?.itemSubType,
        entityId: options?.entityId
      } as IotHubAddItemDialogData
    }).afterClosed();
  }

  installItem(item: MpItemVersionView): Observable<string> {
    if (item.type === ItemType.DEVICE) {
      return this.installDevice(item);
    }
    return this.dialog.open(TbIotHubInstallDialogComponent, {
      panelClass: ['tb-dialog'],
      autoFocus: false,
      data: { item } as IotHubInstallDialogData
    }).afterClosed();
  }

  updateItem(item: MpItemVersionView, installedItem: IotHubInstalledItem): Observable<string> {
    if (!installedItem) {
      return EMPTY;
    }
    return this.dialog.open(TbIotHubUpdateDialogComponent, {
      panelClass: ['tb-dialog'],
      autoFocus: false,
      data: {
        installedItemId: installedItem.id.id,
        itemName: item.name,
        itemType: item.type,
        version: item.version,
        versionId: item.id
      } as IotHubUpdateDialogData
    }).afterClosed();
  }

  deleteItem(item: MpItemVersionView, installedItem: IotHubInstalledItem): Observable<boolean> {
    if (!installedItem) {
      return of(false);
    }
    return this.dialog.open(TbIotHubDeleteDialogComponent, {
      panelClass: ['tb-dialog'],
      autoFocus: false,
      data: { itemName: item.name, itemType: item.type } as IotHubDeleteDialogData
    }).afterClosed().pipe(
      filter(confirmed => !!confirmed),
      mergeMap(() => this.iotHubApiService.deleteInstalledItem(installedItem.id.id)),
      mergeMap(() => of(true))
    );
  }

  installDevice(item: MpItemVersionView): Observable<string> {
    return this.iotHubApiService.getVersionFileData(item.id as string, { ignoreLoading: true }).pipe(
      mergeMap((blob: Blob) => blob.arrayBuffer()),
      mergeMap((zipData: ArrayBuffer) =>
        this.dialog.open(TbDeviceInstallDialogComponent, {
          panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
          disableClose: true,
          autoFocus: false,
          data: { item, zipData } as DeviceInstallDialogData
        }).afterClosed()
      )
    );
  }
}
