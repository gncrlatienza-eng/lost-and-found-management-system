import * as Linking from 'expo-linking';
import { supabase } from './supabase';

type AuthRedirectParams = {
  accessToken?: string;
  refreshToken?: string;
  type?: string;
};

const parseParamString = (value: string) => {
  return value
    .split('&')
    .filter(Boolean)
    .reduce<Record<string, string>>((params, pair) => {
      const [rawKey, rawValue = ''] = pair.split('=');
      if (!rawKey) return params;

      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
      return params;
    }, {});
};

export const getAuthRedirectParams = (url: string): AuthRedirectParams => {
  const [base, hash = ''] = url.split('#');
  const query = base.includes('?') ? base.split('?')[1] ?? '' : '';
  const params = {
    ...parseParamString(query),
    ...parseParamString(hash),
  };

  return {
    accessToken: params.access_token,
    refreshToken: params.refresh_token,
    type: params.type,
  };
};

export const createSessionFromRedirectUrl = async (url: string) => {
  const { accessToken, refreshToken, type } = getAuthRedirectParams(url);

  if (!accessToken || !refreshToken) {
    return { type: type ?? null, session: null };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) throw error;

  return { type: type ?? null, session: data.session };
};

export const getResetPasswordRedirectUrl = () => {
  return Linking.createURL('/reset-password');
};
