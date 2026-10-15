import { useSessionBarFields } from '@irdashies/context';

export const useDriverIncidents = () => {
  const snapshot = useSessionBarFields(
    'incidents',
    'incidentLimit',
    'incidentWarningInitialLimit',
    'incidentWarningSubsequentLimit'
  );
  return {
    incidents: snapshot?.incidents ?? 0,
    incidentLimit: snapshot?.incidentLimit,
    incidentWarningInitialLimit: snapshot?.incidentWarningInitialLimit,
    incidentWarningSubsequentLimit: snapshot?.incidentWarningSubsequentLimit,
  };
};
