"use client";

import { useCallback, useEffect, useState } from "react";
import type { CustomCharacter, CustomCharacterInput } from "@/types/custom-character";
import { DEFAULT_CUSTOM_CHARACTER_AGE, DEFAULT_CUSTOM_CHARACTER_GENDER, MAX_CUSTOM_CHARACTERS } from "@/types/custom-character";
import type { User } from "@/lib/supabase";
import { getAuthHeaders } from "@/lib/auth-headers";
import { fillCustomCharacterOptionalFields } from "@/lib/custom-character-defaults";
import { normalizeCustomCharacterRow } from "@/lib/custom-character-persistence";

const CUSTOM_CHARACTERS_ENDPOINT = "/api/custom-characters";

export function useCustomCharacters(user: User | null) {
  const [characters, setCharacters] = useState<CustomCharacter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCharacters = useCallback(async () => {
    if (!user) {
      setCharacters([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(CUSTOM_CHARACTERS_ENDPOINT, {
        headers: await getAuthHeaders(),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        characters?: CustomCharacter[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to fetch characters");
      const visibleRows = (payload.characters ?? []).map(normalizeCustomCharacterRow);
      setCharacters(visibleRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch characters");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createCharacter = useCallback(async (input: CustomCharacterInput): Promise<CustomCharacter | null> => {
    if (!user) return null;

    if (characters.length >= MAX_CUSTOM_CHARACTERS) {
      setError(`Maximum ${MAX_CUSTOM_CHARACTERS} custom characters allowed`);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const normalizedInput = fillCustomCharacterOptionalFields(input);
      const displayName = normalizedInput.display_name.trim();
      const avatarSeed = normalizedInput.avatar_seed?.trim() || `${displayName}-${Date.now()}`;
      
      const response = await fetch(CUSTOM_CHARACTERS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          input: {
            ...normalizedInput,
            avatar_seed: normalizedInput.avatar_seed?.trim() || avatarSeed,
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        character?: CustomCharacter;
        error?: string;
      };
      if (!response.ok || !payload.character) throw new Error(payload.error || "Failed to create character");
      
      const newChar = normalizeCustomCharacterRow(payload.character);
      setCharacters(prev => [newChar, ...prev]);
      return newChar;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create character");
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, characters.length]);

  const updateCharacter = useCallback(async (
    id: string,
    input: Partial<CustomCharacterInput>
  ): Promise<CustomCharacter | null> => {
    if (!user) return null;

    setLoading(true);
    setError(null);

    try {
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

      const shouldNormalizeOptionalFields =
        input.mbti !== undefined || input.basic_info !== undefined || input.style_label !== undefined;
      const normalizedInput = shouldNormalizeOptionalFields
        ? fillCustomCharacterOptionalFields({
            display_name: input.display_name ?? "",
            gender: (input.gender as CustomCharacterInput["gender"]) ?? DEFAULT_CUSTOM_CHARACTER_GENDER,
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

      const response = await fetch(CUSTOM_CHARACTERS_ENDPOINT, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ id, input: updateData }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        character?: CustomCharacter;
        error?: string;
      };
      if (!response.ok || !payload.character) throw new Error(payload.error || "Failed to update character");
      
      const updated = normalizeCustomCharacterRow(payload.character);
      setCharacters(prev => prev.map(c => c.id === id ? updated : c));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update character");
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const deleteCharacter = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(CUSTOM_CHARACTERS_ENDPOINT, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ id }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to delete character");
      
      setCharacters(prev => prev.filter(c => c.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete character");
      return false;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchCharacters();
  }, [fetchCharacters]);

  return {
    characters,
    loading,
    error,
    fetchCharacters,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    canAddMore: characters.length < MAX_CUSTOM_CHARACTERS,
    remainingSlots: MAX_CUSTOM_CHARACTERS - characters.length,
  };
}
