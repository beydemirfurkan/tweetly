export function mockLocator() {
  const loc: any = {
    count: jest.fn().mockResolvedValue(0),
    waitFor: jest.fn().mockResolvedValue(null),
    click: jest.fn().mockResolvedValue(null),
    fill: jest.fn().mockResolvedValue(null),
    first: jest.fn(),
  };
  loc.first.mockReturnValue(loc);
  return loc;
}

export function mockPage() {
  const loc = mockLocator();
  return {
    goto: jest.fn().mockResolvedValue(null),
    waitForSelector: jest.fn().mockResolvedValue(null),
    waitForTimeout: jest.fn().mockResolvedValue(null),
    locator: jest.fn().mockReturnValue(loc),
    getByRole: jest.fn().mockReturnValue(loc),
    evaluate: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(null),
    _locator: loc,
  };
}

export function mockXBrowserService() {
  const page = mockPage();
  const context = {
    newPage: jest.fn().mockResolvedValue(page),
    close: jest.fn().mockResolvedValue(null),
  };
  const service = {
    launch: jest.fn().mockResolvedValue({ context, page }),
    assertSessionHealthy: jest.fn().mockResolvedValue(null),
    release: jest.fn().mockResolvedValue(null),
  };
  return { service, page, context };
}
