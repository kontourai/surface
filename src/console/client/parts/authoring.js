function buildClaimTypeOptions() {
  const select = el("claimTypeSelect");
  if (!select) return;
  if (select.dataset.ready === "true") return;
  const options = claimTypes.length
    ? claimTypes.map(t => `<option value="${esc(t.id)}">${esc(t.displayName ?? t.id)}</option>`).join("")
    : `<option value="automation-evidence">Automation evidence</option>
       <option value="governance-artifact">Governance artifact</option>
       <option value="external-observation">External observation</option>`;
  select.innerHTML = options;
  select.dataset.ready = "true";
  select.addEventListener("change", syncClaimTypeFields);
  syncClaimTypeFields();
}

function selectedClaimType() {
  const id = el("claimTypeSelect")?.value;
  return claimTypes.find(t => t.id === id) ?? null;
}

function syncClaimTypeFields() {
  const type = selectedClaimType();
  if (type) {
    el("claimTypeHint").textContent = type.description ?? "";
    if (!el("claimSurfaceInput").value && type.defaultSurface) el("claimSurfaceInput").value = type.defaultSurface;
    if (type.defaultImpact) el("claimImpactSelect").value = type.defaultImpact;
    if (!el("claimPolicyInput").value && type.policyTemplateId) el("claimPolicyInput").value = type.policyTemplateId;
  } else {
    el("claimTypeHint").textContent = "";
  }
  renderMetadataFields(type?.metadataFields ?? []);
}

function renderMetadataFields(fields) {
  const container = el("claimMetadataFields");
  if (!container) return;
  container.innerHTML = fields.map(field => `
    <div class="form-field">
      <label for="metadata-${esc(field.key)}">${esc(field.label)}</label>
      <input id="metadata-${esc(field.key)}" data-metadata-key="${esc(field.key)}" data-metadata-type="${esc(field.type)}"
        type="${field.type === "number" ? "number" : field.type === "boolean" ? "checkbox" : "text"}"
        ${field.required ? "required" : ""} autocomplete="off">
      ${field.hint ? `<p class="field-hint">${esc(field.hint)}</p>` : ""}
    </div>`).join("");
}

function openClaimModal(existing) {
  buildClaimTypeOptions();
  el("claimModalTitle").textContent = existing ? "Edit claim" : "Add claim";
  el("claimIdInput").value = existing?.id ?? "";
  el("claimTypeSelect").value = existing?.claimType ?? el("claimTypeSelect").value;
  el("claimSurfaceInput").value = existing?.surface ?? "";
  el("claimFieldInput").value = existing?.fieldOrBehavior ?? "";
  el("claimSubjectTypeInput").value = existing?.subjectType ?? "";
  el("claimSubjectIdInput").value = existing?.subjectId ?? "";
  el("claimImpactSelect").value = existing?.impactLevel ?? selectedClaimType()?.defaultImpact ?? "medium";
  el("claimPolicyInput").value = existing?.verificationPolicyId ?? selectedClaimType()?.policyTemplateId ?? "";
  syncClaimTypeFields();
  for (const input of document.querySelectorAll("[data-metadata-key]")) {
    const key = input.dataset.metadataKey;
    const value = existing?.metadata?.[key];
    if (input.type === "checkbox") input.checked = value === true;
    else if (value !== undefined) input.value = String(value);
  }
  el("claimModal").showModal();
}

function closeClaimModal() {
  el("claimModal")?.close();
  el("claimForm")?.reset();
}

async function submitClaimForm(event) {
  event.preventDefault();
  const editingId = el("claimIdInput").value;
  const metadata = {};
  for (const input of document.querySelectorAll("[data-metadata-key]")) {
    const key = input.dataset.metadataKey;
    const type = input.dataset.metadataType;
    if (type === "boolean") {
      metadata[key] = input.checked;
    } else if (input.value !== "") {
      metadata[key] = type === "number" ? Number(input.value) : input.value;
    }
  }
  const body = {
    claimType: el("claimTypeSelect").value,
    surface: el("claimSurfaceInput").value,
    fieldOrBehavior: el("claimFieldInput").value,
    subjectType: el("claimSubjectTypeInput").value,
    subjectId: el("claimSubjectIdInput").value,
    impactLevel: el("claimImpactSelect").value,
    verificationPolicyId: el("claimPolicyInput").value || undefined,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
  const response = await fetch(editingId ? `/api/claims/${encodeURIComponent(editingId)}` : "/api/claims", {
    method: editingId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Claim save failed");
  }
  closeClaimModal();
  closeSheet();
  await refreshConsole(null);
}

async function deleteCurrentClaim(claimId) {
  if (!claimId) return;
  const response = await fetch(`/api/claims/${encodeURIComponent(claimId)}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Claim delete failed");
  }
  closeSheet();
  await refreshConsole(null);
}

function openDeleteConfirm(claimId) {
  if (!claimId) return;
  pendingDeleteClaimId = claimId;
  const idEl = el("deleteConfirmClaimId");
  const errorEl = el("deleteConfirmError");
  if (idEl) idEl.textContent = claimId;
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.setAttribute("hidden", "");
  }
  el("deleteConfirmModal")?.showModal();
}

function closeDeleteConfirm() {
  pendingDeleteClaimId = null;
  el("deleteConfirmModal")?.close();
}

async function confirmDeleteClaim() {
  if (!pendingDeleteClaimId) return;
  const submit = el("deleteConfirmSubmit");
  const errorEl = el("deleteConfirmError");
  if (submit) submit.disabled = true;
  try {
    await deleteCurrentClaim(pendingDeleteClaimId);
    closeDeleteConfirm();
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error?.message ?? "Claim delete failed";
      errorEl.removeAttribute("hidden");
    }
  } finally {
    if (submit) submit.disabled = false;
  }
}
