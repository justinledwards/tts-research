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
  voice("af_alloy", "Alloy", "a", "Female", "C"),
  voice("af_aoede", "Aoede", "a", "Female", "C+"),
  voice("af_bella", "Bella", "a", "Female", "A-"),
  voice("af_jessica", "Jessica", "a", "Female", "D"),
  voice("af_kore", "Kore", "a", "Female", "C+"),
  voice("af_nicole", "Nicole", "a", "Female", "B-"),
  voice("af_nova", "Nova", "a", "Female", "C"),
  voice("af_river", "River", "a", "Female", "D"),
  voice("af_sarah", "Sarah", "a", "Female", "C+"),
  voice("af_sky", "Sky", "a", "Female", "C-"),
  voice("am_adam", "Adam", "a", "Male", "F+"),
  voice("am_echo", "Echo", "a", "Male", "D"),
  voice("am_eric", "Eric", "a", "Male", "D"),
  voice("am_fenrir", "Fenrir", "a", "Male", "C+"),
  voice("am_liam", "Liam", "a", "Male", "D"),
  voice("am_michael", "Michael", "a", "Male", "C+"),
  voice("am_onyx", "Onyx", "a", "Male", "D"),
  voice("am_puck", "Puck", "a", "Male", "C+"),
  voice("am_santa", "Santa", "a", "Male", "D-"),
  voice("bf_alice", "Alice", "b", "Female", "D"),
  voice("bf_emma", "Emma", "b", "Female", "B-"),
  voice("bf_isabella", "Isabella", "b", "Female", "C"),
  voice("bf_lily", "Lily", "b", "Female", "D"),
  voice("bm_daniel", "Daniel", "b", "Male", "D"),
  voice("bm_fable", "Fable", "b", "Male", "C"),
  voice("bm_george", "George", "b", "Male", "C"),
  voice("bm_lewis", "Lewis", "b", "Male", "D+"),
  voice("jf_alpha", "Alpha", "j", "Female", "C+"),
  voice("jf_gongitsune", "Gongitsune", "j", "Female", "C"),
  voice("jf_nezumi", "Nezumi", "j", "Female", "C-"),
  voice("jf_tebukuro", "Tebukuro", "j", "Female", "C"),
  voice("jm_kumo", "Kumo", "j", "Male", "C-"),
  voice("zf_xiaobei", "Xiaobei", "z", "Female", "D"),
  voice("zf_xiaoni", "Xiaoni", "z", "Female", "D"),
  voice("zf_xiaoxiao", "Xiaoxiao", "z", "Female", "D"),
  voice("zf_xiaoyi", "Xiaoyi", "z", "Female", "D"),
  voice("zm_yunjian", "Yunjian", "z", "Male", "D"),
  voice("zm_yunxi", "Yunxi", "z", "Male", "D"),
  voice("zm_yunxia", "Yunxia", "z", "Male", "D"),
  voice("zm_yunyang", "Yunyang", "z", "Male", "D"),
  voice("ef_dora", "Dora", "e", "Female"),
  voice("em_alex", "Alex", "e", "Male"),
  voice("em_santa", "Santa", "e", "Male"),
  voice("ff_siwis", "Siwis", "f", "Female", "B-"),
  voice("hf_alpha", "Alpha", "h", "Female", "C"),
  voice("hf_beta", "Beta", "h", "Female", "C"),
  voice("hm_omega", "Omega", "h", "Male", "C"),
  voice("hm_psi", "Psi", "h", "Male", "C"),
  voice("if_sara", "Sara", "i", "Female", "C"),
  voice("im_nicola", "Nicola", "i", "Male", "C"),
  voice("pf_dora", "Dora", "p", "Female"),
  voice("pm_alex", "Alex", "p", "Male"),
  voice("pm_santa", "Santa", "p", "Male"),
];

function voice(
  id: string,
  name: string,
  langCode: KokoroVoicepack["langCode"],
  gender: KokoroVoicepack["gender"],
  grade?: string,
  description?: string,
): KokoroVoicepack {
  const locale = LOCALE_BY_LANG_CODE[langCode];
  return {
    id,
    name,
    locale,
    gender,
    langCode,
    grade,
    description: description ?? `${locale} ${gender.toLowerCase()} voice`,
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
