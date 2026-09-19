import React from 'react';
import { AttackGraphCanvas } from '../components/graph/AttackGraphCanvas';

export const AttackGraphPage = () => {
  return (
    <div className="w-full -m-4 sm:-m-8 animate-in fade-in duration-200">
      <AttackGraphCanvas />
    </div>
  );
};

