import { trackEvent } from './posthogConfig';

/**
 * Analytics utility functions for tracking user interactions
 */

export const analytics = {
  // Plan events
  planCreated: (title: string, tagsCount: number, placesCount: number, transport: string) => {
    trackEvent('plan_created', {
      title,
      tags_count: tagsCount,
      places_count: placesCount,
      transport,
    });
  },

  planLiked: (planId: string, planTitle: string, authorId: string) => {
    trackEvent('plan_liked', {
      plan_id: planId,
      plan_title: planTitle,
      author_id: authorId,
    });
  },

  planUnliked: (planId: string) => {
    trackEvent('plan_unliked', { plan_id: planId });
  },

  planSaved: (planId: string, planTitle: string) => {
    trackEvent('plan_saved', {
      plan_id: planId,
      plan_title: planTitle,
    });
  },

  planUnsaved: (planId: string) => {
    trackEvent('plan_unsaved', { plan_id: planId });
  },

  planShared: (planId: string, planTitle: string, platform?: string) => {
    trackEvent('plan_shared', {
      plan_id: planId,
      plan_title: planTitle,
      platform,
    });
  },

  // Comment events
  commentPosted: (planId: string, commentLength: number) => {
    trackEvent('comment_posted', {
      plan_id: planId,
      comment_length: commentLength,
    });
  },

  // User interaction events
  userFollowed: (userId: string, userName: string) => {
    trackEvent('user_followed', {
      followed_user_id: userId,
      followed_user_name: userName,
    });
  },

  userUnfollowed: (userId: string) => {
    trackEvent('user_unfollowed', { unfollowed_user_id: userId });
  },

  profileViewed: (userId: string, userName: string, isOwnProfile: boolean) => {
    trackEvent('profile_viewed', {
      viewed_user_id: userId,
      viewed_user_name: userName,
      is_own_profile: isOwnProfile,
    });
  },

  // Screen/Navigation events
  screenViewed: (screenName: string) => {
    trackEvent('screen_viewed', { screen_name: screenName });
  },

  // Search events
  searchPerformed: (query: string, resultCount: number) => {
    trackEvent('search_performed', {
      query,
      result_count: resultCount,
    });
  },

  // Engagement events
  planDetailViewed: (planId: string, planTitle: string) => {
    trackEvent('plan_detail_viewed', {
      plan_id: planId,
      plan_title: planTitle,
    });
  },

  categoryViewed: (categoryName: string) => {
    trackEvent('category_viewed', { category_name: categoryName });
  },

  profileEdited: () => {
    trackEvent('profile_edited');
  },

  settingsChanged: (settingName: string) => {
    trackEvent('settings_changed', { setting_name: settingName });
  },
};

export default analytics;
