import { View, TouchableOpacity, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';

export default function LanguageToggle() {
  const { i18n } = useTranslation();
  const { language, setLanguage } = useSettingsStore();

  const toggleLanguage = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  return (
    <View className="flex-row rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <TouchableOpacity onPress={() => toggleLanguage('en')} className={`px-3 py-1 ${language === 'en' ? 'bg-primary-600' : 'bg-transparent'}`} accessibilityLabel="English">
        <Text className={`text-sm font-medium ${language === 'en' ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>EN</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => toggleLanguage('hi')} className={`px-3 py-1 ${language === 'hi' ? 'bg-primary-600' : 'bg-transparent'}`} accessibilityLabel="Hindi">
        <Text className={`text-sm font-medium ${language === 'hi' ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>हिं</Text>
      </TouchableOpacity>
    </View>
  );
}
