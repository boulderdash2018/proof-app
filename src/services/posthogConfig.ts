import posthog from 'posthog-js';

const POSTHOG_KEY = 'phc_vRfQXSaYL4sumphQeQYDavtFcBFP5LrTTpUEJd3rbEyE';
const POSTHOG_URL = 'https://us.posthog.com';

export const initPostHog = () => {
  if (typeof window !== 'undefined') {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_URL,
      autocapture: true,
      // Canvas recording is disabled by default in posthog-js — no override needed.
    });
  }
};

export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  posthog.capture(eventName, properties);
};

export const identifyUser = (userId: string, properties?: Record<string, any>) => {
  posthog.identify(userId, properties);
};

export const resetUser = () => {
  posthog.reset();
};

export default posthog;
