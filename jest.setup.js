/**
 * Jest setup.
 *
 * AsyncStorage is a native module with no JS implementation under test, so it must be
 * swapped for the in-memory mock the package ships. Without this, importing the contact
 * store throws "NativeModule: AsyncStorage is null".
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
