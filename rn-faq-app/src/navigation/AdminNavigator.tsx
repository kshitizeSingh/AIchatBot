// src/navigation/AdminNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
// import Icon from 'react-native-vector-icons/MaterialIcons';
// Using Text as placeholder for icons until react-native-vector-icons is properly configured
import { Text } from 'react-native';

// Admin Screens
import DashboardScreen from '../screens/admin/DashboardScreen';
import DocumentScreen from '../screens/admin/DocumentScreen';
import UploadScreen from '../screens/admin/UploadScreen';
import UserManagementScreen from '../screens/admin/UserManagementScreen';

// Types
import type { AdminTabParamList, AdminStackParamList } from '../types';

const Tab = createBottomTabNavigator<AdminTabParamList>();
const Stack = createStackNavigator<AdminStackParamList>();

// Document Stack Navigator
const DocumentStackNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#007AFF',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="DocumentList"
        component={DocumentScreen}
        options={{ title: 'Documents' }}
      />
      <Stack.Screen
        name="Upload"
        component={UploadScreen}
        options={{ title: 'Upload Document' }}
      />
    </Stack.Navigator>
  );
};

const AdminNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconText: string;

          switch (route.name) {
            case 'Dashboard':
              iconText = '📊';
              break;
            case 'Documents':
              iconText = '📄';
              break;
            case 'Users':
              iconText = '👥';
              break;
            default:
              iconText = '❓';
          }

          return <Text style={{ fontSize: size, color }}>{iconText}</Text>;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
        }}
      />
      <Tab.Screen
        name="Documents"
        component={DocumentStackNavigator}
        options={{
          title: 'Documents',
        }}
      />
      <Tab.Screen
        name="Users"
        component={UserManagementScreen}
        options={{
          title: 'Users',
        }}
      />
    </Tab.Navigator>
  );
};

export default AdminNavigator;