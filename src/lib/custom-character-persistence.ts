import type { CustomCharacterInput } from "@/types/custom-character";
import type { Database } from "@/types/database";

type CustomCharacterInsert = Database["public"]["Tables"]["custom_characters"]["Insert"];

type CustomCharacterDeletionState = {
  is_deleted?: boolean | null;
};

export function isVisibleCustomCharacter(row: CustomCharacterDeletionState): boolean {
  return row.is_deleted !== true;
}

export function normalizeCustomCharacterRow<T extends CustomCharacterDeletionState>(
  row: T
): T & { is_deleted: boolean } {
  return {
    ...row,
    is_deleted: row.is_deleted === true,
  };
}

export function buildCustomCharacterInsert(
  userId: string,
  input: CustomCharacterInput,
  fallbackAvatarSeed: string
): CustomCharacterInsert {
  return {
    user_id: userId,
    display_name: input.display_name.trim(),
    gender: input.gender,
    age: input.age,
    mbti: input.mbti.toUpperCase(),
    basic_info: input.basic_info?.trim() || null,
    style_label: input.style_label?.trim() || null,
    avatar_seed: input.avatar_seed?.trim() || fallbackAvatarSeed,
    is_deleted: false,
  };
}
