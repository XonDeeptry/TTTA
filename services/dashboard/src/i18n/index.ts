import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Wired từ màn hình đầu tiên (mục 3.11) — thêm chuỗi khi thêm 4 phân hệ còn lại ở M4,
// tránh chi phí retrofit i18n về sau mà tài liệu kiến trúc đã cảnh báo.
const resources = {
  vi: {
    translation: {
      'login.title': 'Đăng nhập',
      'login.email': 'Email',
      'login.password': 'Mật khẩu',
      'login.submit': 'Đăng nhập',
      'login.error': 'Sai email hoặc mật khẩu',
      'nav.settings': 'Cấu hình hệ thống',
      'nav.onboarding': 'Onboarding',
      'nav.logout': 'Đăng xuất',
      'settings.title': 'Cấu hình hệ thống',
      'settings.save': 'Lưu',
      'settings.saved': 'Đã lưu',
      'onboarding.title': 'Tài khoản chờ kích hoạt',
      'onboarding.empty': 'Không có tài khoản nào đang chờ',
      'onboarding.phone': 'Số điện thoại học viên',
      'onboarding.activate': 'Kích hoạt',
      'onboarding.activated': 'Đã kích hoạt',
    },
  },
  en: {
    translation: {
      'login.title': 'Log in',
      'login.email': 'Email',
      'login.password': 'Password',
      'login.submit': 'Log in',
      'login.error': 'Invalid email or password',
      'nav.settings': 'System settings',
      'nav.onboarding': 'Onboarding',
      'nav.logout': 'Log out',
      'settings.title': 'System settings',
      'settings.save': 'Save',
      'settings.saved': 'Saved',
      'onboarding.title': 'Pending accounts',
      'onboarding.empty': 'No pending bindings',
      'onboarding.phone': "Student's phone number",
      'onboarding.activate': 'Activate',
      'onboarding.activated': 'Activated',
    },
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: 'vi',
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
});

export default i18n;
