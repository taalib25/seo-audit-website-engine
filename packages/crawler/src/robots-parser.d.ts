declare module "robots-parser" {
  interface RobotsRules {
    isAllowed(url: string, userAgent?: string): boolean | undefined;
    getCrawlDelay(userAgent?: string): number | undefined;
  }

  export default function robotsParser(robotsUrl: string, robotsTxt: string): RobotsRules;
}
