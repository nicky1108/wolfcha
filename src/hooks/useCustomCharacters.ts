"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CustomCharacter, CustomCharacterInput } from "@/types/custom-character";
import { DEFAULT_CUSTOM_CHARACTER_AGE, DEFAULT_CUSTOM_CHARACTER_GENDER, MAX_CUSTOM_CHARACTERS } from "@/types/custom-character";
import type { User } from "@supabase/supabase-js";
import { fillCustomCharacterOptionalFields } from "@/lib/custom-character-defaults";
import {
  buildCustomCharacterInsert,
  isVisibleCustomCharacter,
  normalizeCustomCharacterRow,
} from "@/lib/custom-character-persistence";

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
      const { data, error: fetchError } = await supabase
        .from("custom_characters")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      const visibleRows = ((data as CustomCharacter[]) ?? [])
        .filter(isVisibleCustomCharacter)
        .map(normalizeCustomCharacterRow);
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
      
      const { data, error: insertError } = await supabase
        .from("custom_characters")
        .insert(buildCustomCharacterInsert(user.id, normalizedInput, avatarSeed) as never)
        .select()
        .single();

      if (insertError) throw insertError;
      
      const newChar = normalizeCustomCharacterRow(data as CustomCharacter);
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

      const { data, error: updateError } = await supabase
        .from("custom_characters")
        .update(updateData as never)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) throw updateError;
      
      const updated = normalizeCustomCharacterRow(data as CustomCharacter);
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
      const { error: deleteError } = await supabase
        .from("custom_characters")
        .update({ is_deleted: true, updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;
      
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
