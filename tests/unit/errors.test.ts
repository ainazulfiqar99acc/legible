import { describe, expect, it } from 'vitest';
import { describeError } from '../../shared/strings';

// Every SmartSpectraErrorCode name in @smartspectra/node-sdk 3.5.0, plus getUserMedia errors.
const SDK_CODES = [
  'kInvalidState',
  'kAuthenticationFailed',
  'kConfigurationFailed',
  'kCreditExhausted',
  'kNetworkError',
  'kServerError',
  'kInputUnavailable',
  'kProcessingFailed',
  'kFrameConversionFailed',
  'kNonMonotonicTimestamp',
  'kTimestampGap',
  'kMetricNotAuthorized',
  'kSustainedLowFrameRate',
];
const MEDIA = ['NotAllowedError', 'NotReadableError', 'NotFoundError', 'OverconstrainedError'];

describe('error messages', () => {
  for (const code of [...SDK_CODES, ...MEDIA, 'noKey', 'somethingNew']) {
    it(`${code}: plain sentence and an action, never a dead end`, () => {
      const e = describeError(code, '', true);
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.detail.length).toBeGreaterThan(10);
      expect(e.action.length).toBeGreaterThan(3);
      expect(['retry', 'setup', 'obs-guide']).toContain(e.actionId);
    });
  }
  it('camera busy points to the OBS guide', () => {
    expect(describeError('kInputUnavailable', '', true).actionId).toBe('obs-guide');
    expect(describeError('NotReadableError', '', true).actionId).toBe('obs-guide');
  });
  it('bad key points to setup', () => {
    expect(describeError('kAuthenticationFailed', '', false).actionId).toBe('setup');
  });
});
