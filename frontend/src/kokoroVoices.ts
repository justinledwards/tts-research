export interface KokoroVoicepack {
  id: string;
  name: string;
  locale:
    | "American English"
    | "Brazilian Portuguese"
    | "British English"
    | "French"
    | "Hindi"
    | "Italian"
    | "Japanese"
    | "Mandarin Chinese"
    | "Spanish";
  gender: "Female" | "Male";
  langCode: "a" | "b" | "e" | "f" | "h" | "i" | "j" | "p" | "z";
  grade?: string;
  description: string;
}

const LOCALE_BY_LANG_CODE: Record<KokoroVoicepack["langCode"], KokoroVoicepack["locale"]> = {
  a: "American English",
  b: "British English",
  e: "Spanish",
  f: "French",
  h: "Hindi",
  i: "Italian",
  j: "Japanese",
  p: "Brazilian Portuguese",
  z: "Mandarin Chinese",
};

// Source: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
// This matches the runtime repo id used by backend/scripts/kokoro_synth.py.
export const KOKORO_VOICEPACKS: KokoroVoicepack[] = [
  voice("af_heart", "Heart", "a", "Female", "A", "Best default American English voice"),
  voice("af_alloy", "Alloy", "a", "Female", "C", "American English female voice"),
  voice("af_aoede", "Aoede", "a", "Female", "C+", "American English female voice"),
  voice("af_bella", "Bella", "a", "Female", "A-", "American English female voice"),
  voice("af_jessica", "Jessica", "a", "Female", "D", "American English female voice"),
  voice("af_kore", "Kore", "a", "Female", "C+", "American English female voice"),
  voice("af_nicole", "Nicole", "a", "Female", "B-", "American English female voice"),
  voice("af_nova", "Nova", "a", "Female", "C", "American English female voice"),
  voice("af_river", "River", "a", "Female", "D", "American English female voice"),
  voice("af_sarah", "Sarah", "a", "Female", "C+", "American English female voice"),
  voice("af_sky", "Sky", "a", "Female", "C-", "American English female voice"),
  voice("am_adam", "Adam", "a", "Male", "F+", "American English male voice"),
  voice("am_echo", "Echo", "a", "Male", "D", "American English male voice"),
  voice("am_eric", "Eric", "a", "Male", "D", "American English male voice"),
  voice("am_fenrir", "Fenrir", "a", "Male", "C+", "American English male voice"),
  voice("am_liam", "Liam", "a", "Male", "D", "American English male voice"),
  voice("am_michael", "Michael", "a", "Male", "C+", "American English male voice"),
  voice("am_onyx", "Onyx", "a", "Male", "D", "American English male voice"),
  voice("am_puck", "Puck", "a", "Male", "C+", "American English male voice"),
  voice("am_santa", "Santa", "a", "Male", "D-", "American English male voice"),
  voice("bf_alice", "Alice", "b", "Female", "D", "British English female voice"),
  voice("bf_emma", "Emma", "b", "Female", "B-", "British English female voice"),
  voice("bf_isabella", "Isabella", "b", "Female", "C", "British English female voice"),
  voice("bf_lily", "Lily", "b", "Female", "D", "British English female voice"),
  voice("bm_daniel", "Daniel", "b", "Male", "D", "British English male voice"),
  voice("bm_fable", "Fable", "b", "Male", "C", "British English male voice"),
  voice("bm_george", "George", "b", "Male", "C", "British English male voice"),
  voice("bm_lewis", "Lewis", "b", "Male", "D+", "British English male voice"),
  voice("jf_alpha", "Alpha", "j", "Female", "C+", "Japanese female voice"),
  voice("jf_gongitsune", "Gongitsune", "j", "Female", "C", "Japanese female voice"),
  voice("jf_nezumi", "Nezumi", "j", "Female", "C-", "Japanese female voice"),
  voice("jf_tebukuro", "Tebukuro", "j", "Female", "C", "Japanese female voice"),
  voice("jm_kumo", "Kumo", "j", "Male", "C-", "Japanese male voice"),
  voice("zf_xiaobei", "Xiaobei", "z", "Female", "D", "Mandarin Chinese female voice"),
  voice("zf_xiaoni", "Xiaoni", "z", "Female", "D", "Mandarin Chinese female voice"),
  voice("zf_xiaoxiao", "Xiaoxiao", "z", "Female", "D", "Mandarin Chinese female voice"),
  voice("zf_xiaoyi", "Xiaoyi", "z", "Female", "D", "Mandarin Chinese female voice"),
  voice("zm_yunjian", "Yunjian", "z", "Male", "D", "Mandarin Chinese male voice"),
  voice("zm_yunxi", "Yunxi", "z", "Male", "D", "Mandarin Chinese male voice"),
  voice("zm_yunxia", "Yunxia", "z", "Male", "D", "Mandarin Chinese male voice"),
  voice("zm_yunyang", "Yunyang", "z", "Male", "D", "Mandarin Chinese male voice"),
  voice("ef_dora", "Dora", "e", "Female", undefined, "Spanish female voice"),
  voice("em_alex", "Alex", "e", "Male", undefined, "Spanish male voice"),
  voice("em_santa", "Santa", "e", "Male", undefined, "Spanish male voice"),
  voice("ff_siwis", "Siwis", "f", "Female", "B-", "French female voice"),
  voice("hf_alpha", "Alpha", "h", "Female", "C", "Hindi female voice"),
  voice("hf_beta", "Beta", "h", "Female", "C", "Hindi female voice"),
  voice("hm_omega", "Omega", "h", "Male", "C", "Hindi male voice"),
  voice("hm_psi", "Psi", "h", "Male", "C", "Hindi male voice"),
  voice("if_sara", "Sara", "i", "Female", "C", "Italian female voice"),
  voice("im_nicola", "Nicola", "i", "Male", "C", "Italian male voice"),
  voice("pf_dora", "Dora", "p", "Female", undefined, "Brazilian Portuguese female voice"),
  voice("pm_alex", "Alex", "p", "Male", undefined, "Brazilian Portuguese male voice"),
  voice("pm_santa", "Santa", "p", "Male", undefined, "Brazilian Portuguese male voice"),
];

function voice(
  id: string,
  name: string,
  langCode: KokoroVoicepack["langCode"],
  gender: KokoroVoicepack["gender"],
  grade: string | undefined,
  description: string,
): KokoroVoicepack {
  return {
    id,
    name,
    locale: LOCALE_BY_LANG_CODE[langCode],
    gender,
    langCode,
    grade,
    description,
  };
}

export function kokoroVoicepackLabel(id: string | null | undefined): string {
  const match = findKokoroVoicepack(id);
  if (!id?.trim()) {
    return "Default voice";
  }
  if (!match) {
    return id.trim();
  }
  return `${match.name} (${match.id})`;
}

export function kokoroVoicepackDetail(id: string | null | undefined): string {
  const match = findKokoroVoicepack(id);
  if (!id?.trim()) {
    return "Configured Kokoro voice";
  }
  if (!match) {
    return "Kokoro voicepack";
  }
  const grade = match.grade ? ` · grade ${match.grade}` : "";
  return `${match.locale} · ${match.gender}${grade} · ${match.description}`;
}

export function findKokoroVoicepack(id: string | null | undefined): KokoroVoicepack | undefined {
  const cleanId = id?.trim();
  if (!cleanId) {
    return undefined;
  }
  return KOKORO_VOICEPACKS.find((voicepack) => voicepack.id === cleanId);
}
