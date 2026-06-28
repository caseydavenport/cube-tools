// ImageURL builds a photo URL. Pass a version (bumped when the photo is rotated
// in place) to bust the browser cache so the rotated file loads.
export function ImageURL(cube, photo, version) {
  return `/api/${cube}/img/${photo}${version ? `?v=${version}` : ""}`;
}

export async function LoadOCRDrafts(cube) {
  const r = await fetch(`/api/${cube}/ocr/drafts`);
  return (await r.json()).drafts || [];
}

export async function LoadOCRDraft(cube, draftId) {
  const r = await fetch(`/api/${cube}/ocr/drafts/${draftId}`);
  return await r.json();
}

export async function LoadOCRCards(cube, draftId) {
  const r = await fetch(`/api/${cube}/ocr/drafts/${draftId}/cards`);
  return (await r.json()).cards || [];
}

export async function LoadOCRConsistency(cube, draftId) {
  const r = await fetch(`/api/${cube}/ocr/drafts/${draftId}/consistency`);
  if (!r.ok) throw new Error(`consistency failed: ${await r.text()}`);
  return await r.json();
}

export async function DetectPhoto(cube, photo) {
  const r = await fetch(`/api/${cube}/ocr/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo }),
  });
  if (!r.ok) throw new Error(`detect failed: ${await r.text()}`);
  return (await r.json()).lines || [];
}

// RotatePhoto rotates a photo 90 degrees in place. direction is "cw" or "ccw".
export async function RotatePhoto(cube, photo, direction) {
  const r = await fetch(`/api/${cube}/ocr/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo, direction }),
  });
  if (!r.ok) throw new Error(`rotate failed: ${await r.text()}`);
}

export async function MatchRegion(cube, photo, box) {
  const r = await fetch(`/api/${cube}/ocr/region`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo, box }),
  });
  if (!r.ok) throw new Error(`region failed: ${await r.text()}`);
  return await r.json();
}

// StartDraftScan kicks off a background scan of every photo in the draft and
// GetDraftScan polls its progress (same path, POST to start, GET to read).
export async function StartDraftScan(cube, draftId) {
  const r = await fetch(`/api/${cube}/ocr/drafts/${draftId}/scan`, { method: "POST" });
  if (!r.ok) throw new Error(`scan failed: ${await r.text()}`);
  return await r.json();
}

export async function GetDraftScan(cube, draftId) {
  const r = await fetch(`/api/${cube}/ocr/drafts/${draftId}/scan`);
  return await r.json();
}

export async function LoadOCRSession(cube, draftId) {
  const r = await fetch(`/api/${cube}/ocr/drafts/${draftId}/session`);
  return await r.json();
}

export async function SaveOCRSession(cube, draftId, session) {
  const r = await fetch(`/api/${cube}/ocr/drafts/${draftId}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  if (!r.ok) throw new Error("save session failed");
}

export async function ConfirmPlayer(cube, draftId, player, payload) {
  const r = await fetch(`/api/${cube}/ocr/drafts/${draftId}/players/${player}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`confirm failed: ${await r.text()}`);
}
