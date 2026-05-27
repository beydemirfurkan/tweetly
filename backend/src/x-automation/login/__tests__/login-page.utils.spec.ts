import { isRetryableLoginPageText } from '../login-page.utils';

describe('isRetryableLoginPageText', () => {
  it('matches the Turkish X reload error page', () => {
    expect(
      isRetryableLoginPageText(
        'Bir sorun oluştu. Yeniden yüklemeyi dene. Yeniden dene Şu anda olup bitenler',
      ),
    ).toBe(true);
  });

  it('matches the English X reload error page', () => {
    expect(isRetryableLoginPageText('Something went wrong. Try reloading. Try again.')).toBe(true);
  });

  it('does not match normal login copy', () => {
    expect(isRetryableLoginPageText('Sign in to X. Phone, email, or username. Next.')).toBe(false);
  });
});
