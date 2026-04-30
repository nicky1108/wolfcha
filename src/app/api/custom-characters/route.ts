import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { fillCustomCharacterOptionalFields } from "@/lib/custom-character-defaults";
import {
  buildCustomCharacterInsert,
  isVisibleCustomCharacter,
  normalizeCustomCharacterRow,
} from "@/lib/custom-character-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CustomCharacterInput } from "@/types/custom-character";
import {
  DEFAULT_CUSTOM_CHARACTER_AGE,
  DEFAULT_CUSTOM_CHARACTER_GENDER,
} from "@/types/custom-character";

export const dynamic = "force-dynamic";

type MutationPayload = {
  id?: unknown;
  input?: Partial<CustomCharacterInput>;
};

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await supabaseAdmin
    .from("custom_characters")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((data as unknown[]) ?? [])
    .filter((row) => isVisibleCustomCharacter(row as { is_deleted?: boolean | null }))
    .map((row) => normalizeCustomCharacterRow(row as { is_deleted?: boolean | null }));

  return NextResponse.json({ characters: rows });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => ({}))) as { input?: CustomCharacterInput };
  if (!payload.input?.display_name?.trim()) {
    return NextResponse.json({ error: "Missing display name" }, { status: 400 });
  }

  const normalizedInput = fillCustomCharacterOptionalFields(payload.input);
  const displayName = normalizedInput.display_name.trim();
  const avatarSeed = normalizedInput.avatar_seed?.trim() || `${displayName}-${Date.now()}`;
  const { data, error } = await supabaseAdmin
    .from("custom_characters")
    .insert(buildCustomCharacterInsert(auth.user.id, normalizedInput, avatarSeed) as never)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Failed to create character" }, { status: 500 });
  }

  return NextResponse.json({ character: normalizeCustomCharacterRow(data as { is_deleted?: boolean | null }) });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => ({}))) as MutationPayload;
  const id = typeof payload.id === "string" ? payload.id : "";
  const input = payload.input ?? {};
  if (!id) {
    return NextResponse.json({ error: "Missing character id" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const shouldNormalizeOptionalFields =
    input.mbti !== undefined || input.basic_info !== undefined || input.style_label !== undefined;
  const normalizedInput = shouldNormalizeOptionalFields
    ? fillCustomCharacterOptionalFields({
        display_name: input.display_name ?? "",
        gender: input.gender ?? DEFAULT_CUSTOM_CHARACTER_GENDER,
        age: input.age ?? DEFAULT_CUSTOM_CHARACTER_AGE,
        mbti: input.mbti ?? "",
        basic_info: input.basic_info ?? "",
        style_label: input.style_label ?? "",
        avatar_seed: input.avatar_seed,
      })
    : null;

  if (input.display_name !== undefined) updateData.display_name = input.display_name.trim();
  if (input.gender !== undefined) updateData.gender = input.gender;
  if (input.age !== undefined) updateData.age = input.age;
  if (input.mbti !== undefined) updateData.mbti = (normalizedInput?.mbti ?? input.mbti).toUpperCase();
  if (input.basic_info !== undefined) updateData.basic_info = normalizedInput?.basic_info?.trim() || null;
  if (input.style_label !== undefined) updateData.style_label = normalizedInput?.style_label?.trim() || null;
  if (input.avatar_seed !== undefined) updateData.avatar_seed = input.avatar_seed;

  const { data, error } = await supabaseAdmin
    .from("custom_characters")
    .update(updateData as never)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Failed to update character" }, { status: 500 });
  }

  return NextResponse.json({ character: normalizeCustomCharacterRow(data as { is_deleted?: boolean | null }) });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => ({}))) as MutationPayload;
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) {
    return NextResponse.json({ error: "Missing character id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("custom_characters")
    .update({ is_deleted: true, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
