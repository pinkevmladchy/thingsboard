/**
 * Copyright © 2016-2026 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.thingsboard.server.service.solutions.data.solution;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import org.thingsboard.server.common.data.id.EntityId;

import java.util.List;

@Schema
@Data
public class SolutionInstallResponse extends TenantSolutionTemplateInstructions {

    @Schema(description = "Indicates that template was installed successfully")
    private boolean success;
    @Schema(description = "List of entity IDs created during solution installation")
    private List<EntityId> createdEntityIds;

    public SolutionInstallResponse(TenantSolutionTemplateInstructions instructions, boolean success, List<EntityId> createdEntityIds) {
        super(instructions);
        this.success = success;
        this.createdEntityIds = createdEntityIds;
    }

    public SolutionInstallResponse() {
        super();
    }
}
