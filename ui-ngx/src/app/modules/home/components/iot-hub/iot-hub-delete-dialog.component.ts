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
  itemType?: string;
}

@Component({
  selector: 'tb-iot-hub-delete-dialog',
  standalone: false,
  templateUrl: './iot-hub-delete-dialog.component.html',
  styleUrls: ['./iot-hub-delete-dialog.component.scss']
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
