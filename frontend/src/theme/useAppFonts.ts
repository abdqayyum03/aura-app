import {
  useFonts as useInterFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  useFonts as useMonoFonts,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';

// Two separate useFonts calls (one per font family package) combined into a
// single "are we ready" boolean - this is the standard expo-google-fonts
// pattern when pairing more than one family.
export function useAppFonts(): boolean {
  const [interLoaded] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [monoLoaded] = useMonoFonts({
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  return interLoaded && monoLoaded;
}