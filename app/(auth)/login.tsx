import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((state) => state.login);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || t('login.error'));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50 dark:bg-slate-950"
    >
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-full max-w-sm">
          <Text className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-2 text-center">
            {t('appName')}
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 mb-8 text-center text-base">
            {t('login.subtitle')}
          </Text>

          <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            {error ? (
              <Text className="text-red-500 mb-4 text-center text-sm">{error}</Text>
            ) : null}

            <Text className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{t('login.email')}</Text>
            <TextInput
              className="border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 mb-4 text-slate-900 dark:text-slate-50 bg-slate-50 dark:bg-slate-950"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              accessibilityLabel={t('login.email')}
            />

            <Text className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{t('login.password')}</Text>
            <TextInput
              className="border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 mb-6 text-slate-900 dark:text-slate-50 bg-slate-50 dark:bg-slate-950"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              accessibilityLabel={t('login.password')}
            />

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              className="bg-primary-600 rounded-xl py-3 items-center active:bg-primary-700"
              accessibilityLabel={t('login.signIn')}
            >
              <Text className="text-white font-semibold text-base">
                {loading ? t('common.loading') : t('login.signIn')}
              </Text>
            </TouchableOpacity>

          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
