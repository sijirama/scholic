import React from 'react';
import { Outlet } from 'react-router-dom';

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen w-full">
      <Outlet />
    </div>
  );
};

export default Layout;
