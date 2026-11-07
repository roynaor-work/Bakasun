// v9: wording option A locked (Roy, 07/11). No recorded WAV exists for these ids, so voice falls back to TTS.
// Shared by live placement guidance and the voice recording catalog.
export const PLACEMENT_LINES = {
  far: { text: 'בוא קצת יותר קרוב.',
    tts: 'בּוֹא קְצָת יוֹתֵר קָרוֹב.' },
  near: { text: 'קצת אחורה, שיראו אותך כולו.',
    tts: 'קְצָת אָחוֹרָה, שֶׁיִּרְאוּ אוֹתְךָ כֻּלּוֹ.' },
  right: { text: 'צעד קטן לצד ימין שלך.',
    tts: 'צַעַד קָטָן לְצַד יָמִין שֶׁלְּךָ.' },
  left: { text: 'צעד קטן לצד שמאל שלך.',
    tts: 'צַעַד קָטָן לְצַד שְׂמֹאל שֶׁלְּךָ.' },
  arrow: { text: 'בלי ימין ושמאל. צעד קטן בכיוון החץ.',
    tts: 'בְּלִי יָמִין וּשְׂמֹאל. צַעַד קָטָן בְּכִוּוּן הַחֵץ.' },
  'wrong-side': { text: 'הלכת לצד השני. זה הצד השני שלך. תזוז לצד ההפוך, לפי החץ.',
    tts: 'הָלַכְתָּ לַצַּד הַשֵּׁנִי. זֶה הַצַּד הַשֵּׁנִי שֶׁלְּךָ. תָּזוּז לַצַּד הַהָפוּךְ, לְפִי הַחֵץ.' },
  arrived: { text: 'יופי, עומדים.', tts: 'יוֹפִי, עוֹמְדִים.' },
};
