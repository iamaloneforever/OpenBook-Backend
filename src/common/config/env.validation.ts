export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (typeof config[name] !== 'string' || !config[name].trim()) {
      throw new Error(`${name} must be configured`);
    }
  }

  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error('JWT access and refresh secrets must be different');
  }

  return config;
}
