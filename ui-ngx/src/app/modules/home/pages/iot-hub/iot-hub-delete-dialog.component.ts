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

export interface IotHubDeleteDialogData {
  itemName: string;
}

@Component({
  selector: 'tb-iot-hub-delete-dialog',
  standalone: false,
  template: `
    <div class="tb-iot-hub-delete-content">
      <h2 class="tb-iot-hub-delete-title">{{ 'iot-hub.delete-confirm-title' | translate:{ name: data.itemName } }}</h2>
      <p class="tb-iot-hub-delete-desc">{{ 'iot-hub.delete-desc' | translate }}</p>
    </div>
    <div class="tb-iot-hub-delete-actions">
      <button mat-button (click)="cancel()">{{ 'action.cancel' | translate }}</button>
      <button mat-flat-button color="warn" (click)="confirm()">{{ 'iot-hub.delete-anyway' | translate }}</button>
    </div>
  `,
  styles: [`
    .tb-iot-hub-delete-content {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 24px;
    }
    .tb-iot-hub-delete-title {
      font-size: 20px;
      font-weight: 600;
      line-height: 24px;
      letter-spacing: 0.1px;
      color: rgba(0, 0, 0, 0.87);
      margin: 0;
    }
    .tb-iot-hub-delete-desc {
      font-size: 14px;
      font-weight: 400;
      line-height: 20px;
      letter-spacing: 0.2px;
      color: rgba(0, 0, 0, 0.54);
      margin: 0;
    }
    .tb-iot-hub-delete-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px;
    }
  `]
})
export class TbIotHubDeleteDialogComponent {

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: IotHubDeleteDialogData,
    private dialogRef: MatDialogRef<TbIotHubDeleteDialogComponent>
  ) {}

  confirm(): void {
    this.dialogRef.close(true);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
