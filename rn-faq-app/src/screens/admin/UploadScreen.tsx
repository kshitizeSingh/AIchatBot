// src/screens/admin/UploadScreen.tsx
import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';



import UniversalDocumentPicker, { DocumentPickerResponse } from '../../utils/DocumentPicker';
import { SDKContext } from '../../contexts/SDKContext';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
}

const UploadScreen: React.FC = () => {

  const [selectedFile, setSelectedFile] = useState<DocumentPickerResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const sdk = useContext(SDKContext);

  const selectDocument = async () => {
    try {

















      const result = await UniversalDocumentPicker.pick({
        type: [UniversalDocumentPicker.types.pdf, UniversalDocumentPicker.types.doc, UniversalDocumentPicker.types.docx],
        allowMultiSelection: false,
      });

      if (result && result.length > 0) {
        const file = result[0];









        setSelectedFile(file);
        setUploadProgress(null);
      }
    } catch (error: any) {




      const isCancel = UniversalDocumentPicker.isCancel(error);
        
      if (!isCancel) {
        Alert.alert('Error', 'Failed to select document');
      }
    }
  };

  const uploadDocument = async () => {
    if (!selectedFile) {
      Alert.alert('Error', 'Please select a document first');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress({
        fileName: selectedFile.name,
        progress: 0,
        status: 'uploading',
      });

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (!prev || prev.progress >= 90) return prev;
          return {
            ...prev,
            progress: prev.progress + 10,
          };
        });
      }, 200);

      // Upload document using SDK
      const uploadResponse = await sdk.uploadDocument(
        selectedFile.name,

        selectedFile.type
      );

      clearInterval(progressInterval);

      setUploadProgress(prev => prev ? {
        ...prev,
        progress: 100,
        status: 'processing',
      } : null);

      // Simulate processing time
      setTimeout(() => {
        setUploadProgress(prev => prev ? {
          ...prev,
          status: 'completed',
        } : null);

        Alert.alert(
          'Success',
          'Document uploaded successfully! It will be processed and available for queries soon.',
          [
            {
              text: 'OK',
              onPress: () => {
                setSelectedFile(null);
                setUploadProgress(null);
              },
            },
          ]
        );
      }, 2000);

    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadProgress(prev => prev ? {
        ...prev,
        status: 'failed',
        error: error.message || 'Upload failed',
      } : null);
      Alert.alert('Error', 'Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploading':
        return '#007AFF';
      case 'processing':
        return '#FF9500';
      case 'completed':
        return '#34C759';
      case 'failed':
        return '#FF3B30';
      default:
        return '#8E8E93';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing...';
      case 'completed':
        return 'Upload Complete';
      case 'failed':
        return 'Upload Failed';
      default:
        return 'Unknown';
    }
  };

  if (uploading && uploadProgress) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.progressContainer}>
          <Text style={styles.title}>Uploading Document</Text>
          
          <View style={styles.fileInfo}>
            <Text style={styles.fileName}>{uploadProgress.fileName}</Text>
            <Text style={[styles.status, { color: getStatusColor(uploadProgress.status) }]}>
              {getStatusText(uploadProgress.status)}
            </Text>
          </View>

          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${uploadProgress.progress}%`,
                  backgroundColor: getStatusColor(uploadProgress.status),
                },
              ]}
            />
          </View>
          
          <Text style={styles.progressText}>
            {uploadProgress.progress}% Complete
          </Text>

          {uploadProgress.error && (
            <Text style={styles.errorText}>{uploadProgress.error}</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Upload Document</Text>
        <Text style={styles.subtitle}>
          Upload PDF, DOC, or DOCX files to add to your knowledge base
        </Text>

        <View style={styles.uploadSection}>
          {selectedFile ? (
            <View style={styles.selectedFile}>
              <Text style={styles.selectedFileTitle}>Selected File:</Text>
              <View style={styles.fileDetails}>
                <Text style={styles.fileName}>{selectedFile.name}</Text>
                <Text style={styles.fileSize}>
                  {formatFileSize(selectedFile.size)}
                </Text>
                <Text style={styles.fileType}>{selectedFile.type}</Text>
              </View>
              
              <View style={styles.fileActions}>
                <Button
                  title="Change File"
                  onPress={selectDocument}
                  variant="outline"
                  style={styles.changeButton}
                />
                <Button
                  title="Upload"
                  onPress={uploadDocument}
                  loading={uploading}
                  style={styles.uploadButton}
                />
              </View>
            </View>
          ) : (
            <View style={styles.selectSection}>
              <Text style={styles.selectTitle}>Choose a document to upload</Text>
              <Text style={styles.selectSubtitle}>
                Supported formats: PDF, DOC, DOCX
              </Text>
              <Button
                title="Select Document"
                onPress={selectDocument}
                style={styles.selectButton}
              />
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Upload Guidelines</Text>
          <Text style={styles.infoText}>• Maximum file size: 10MB</Text>
          <Text style={styles.infoText}>• Supported formats: PDF, DOC, DOCX</Text>
          <Text style={styles.infoText}>• Processing time: 1-5 minutes</Text>
          <Text style={styles.infoText}>• Documents are automatically indexed for search</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  uploadSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,




    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  selectSection: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  selectTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  selectSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  selectButton: {
    minWidth: 200,
  },
  selectedFile: {
    alignItems: 'stretch',
  },
  selectedFileTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  fileDetails: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  fileType: {
    fontSize: 14,
    color: '#666',
  },
  fileActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  changeButton: {
    flex: 1,
  },
  uploadButton: {
    flex: 1,
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,




    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  progressContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  fileInfo: {
    alignItems: 'center',
    marginBottom: 32,
  },
  status: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    marginTop: 16,
    textAlign: 'center',
  },
});

export default UploadScreen;