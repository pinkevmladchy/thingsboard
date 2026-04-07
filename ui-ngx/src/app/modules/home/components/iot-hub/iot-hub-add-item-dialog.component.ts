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

import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MpItemVersionView } from '@shared/models/iot-hub/iot-hub-version.models';
import { ItemType, itemTypeTranslations } from '@shared/models/iot-hub/iot-hub-item.models';
import { IotHubApiService } from '@core/http/iot-hub-api.service';
import { TranslateService } from '@ngx-translate/core';

export interface IotHubAddItemDialogData {
  itemType: ItemType;
  iotHubApiService: IotHubApiService;
}

export interface IotHubAddItemDialogResult {
  item: MpItemVersionView;
  descriptor: any;
}

@Component({
  selector: 'tb-iot-hub-add-item-dialog',
  standalone: false,
  templateUrl: './iot-hub-add-item-dialog.component.html',
  styleUrls: ['./iot-hub-add-item-dialog.component.scss']
})
export class TbIotHubAddItemDialogComponent {

  itemType: ItemType;
  isInstalling = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: IotHubAddItemDialogData,
    private dialogRef: MatDialogRef<TbIotHubAddItemDialogComponent>,
    private translate: TranslateService
  ) {
    this.itemType = data.itemType;
  }

  getTitle(): string {
    const typeKey = itemTypeTranslations.get(this.itemType);
    const typeLabel = typeKey ? this.translate.instant(typeKey) : '';
    return this.translate.instant('iot-hub.add-item-from-iot-hub', { type: typeLabel });
  }

  onAddItem(item: MpItemVersionView): void {
    this.isInstalling = true;
    const versionId = item.id as string;
    this.data.iotHubApiService.installItemVersion(versionId, { ignoreLoading: true }).subscribe({
      next: (result) => {
        this.isInstalling = false;
        if (result.success) {
          this.dialogRef.close({ item, descriptor: result.descriptor } as IotHubAddItemDialogResult);
        }
      },
      error: () => {
        this.isInstalling = false;
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
