Pod::Spec.new do |s|
  s.name             = 'AmSemnatBridge'
  s.version          = '0.1.0'
  s.summary          = 'Expo bridge for the am-semnat iOS SDK.'
  s.description      = <<~DESC
    Thin Expo Modules bridge over `AmSemnatSDK`. Translates `readIdentity` /
    `sign` / `verifyPassiveOffline` calls from JS into the native Swift SDK
    and fans `AmSemnatLogger` output + read/sign progress events back to
    JavaScript via the Expo event bus.

    Not a standalone dependency — installed automatically by Expo autolinking
    when the parent JS package `@amsemnat/expo-sdk` is installed.
  DESC
  s.homepage         = 'https://github.com/am-semnat/am-semnat-expo-sdk'
  s.license          = { :type => 'Apache-2.0' }
  s.author           = { 'am-semnat contributors' => 'https://github.com/am-semnat' }
  s.source           = { :git => 'https://github.com/am-semnat/am-semnat-expo-sdk.git', :tag => s.version.to_s }

  s.platform         = :ios, '15.0'
  s.swift_version    = '5.9'

  s.source_files     = '**/*.swift'

  s.dependency 'ExpoModulesCore'
  s.dependency 'AmSemnatSDK', '~> 0.1'
end
