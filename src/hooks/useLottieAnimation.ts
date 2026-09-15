import { useEffect, useState } from "react";

export function useLottieAnimation(
  animationPath: string
): { animationData: object | null; isLoading: boolean; error: Error | null } {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAnimation = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Dynamically import the JSON file
        const module = await import(animationPath);
        const data = module.default ?? module;
        
        if (isMounted) {
          setAnimationData(data);
        }
      } catch (err) {
        if (isMounted) {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          console.error(`Failed to load Lottie animation from ${animationPath}:`, error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadAnimation();

    return () => {
      isMounted = false;
    };
  }, [animationPath]);

  return { animationData, isLoading, error };
}
